"""Build public routing assets from official source archives (see docs/SOCAL.md).
Requires Python 3, pyshp, shapely, pyproj. Never collects personal contacts.
"""
import argparse, collections, datetime, hashlib, json, pathlib
import shapefile
from shapely.geometry import shape, mapping
from shapely import set_precision
from shapely.ops import transform, unary_union
from pyproj import Transformer

ROOT = pathlib.Path(__file__).resolve().parents[1]
COUNTIES = {'025','029','037','059','065','071','073','079','083','111'}
WATER_URL = 'https://gispublic.waterboards.ca.gov/portalserver/rest/services/Drinking_Water/California_Drinking_Water_System_Area_Boundaries/MapServer/0'
FILES = {'counties':'cb_2025_us_county_500k.zip','cities':'cb_2025_06_place_500k.zip','districts':'cb_2025_us_cd119_500k.zip','water':'water.json'}
forward = Transformer.from_crs(4326,3310,always_xy=True).transform
backward = Transformer.from_crs(3310,4326,always_xy=True).transform

def geometry(g):
    if not g.is_valid: g = g.buffer(0)
    g = transform(backward,transform(forward,g).simplify(5,preserve_topology=True))
    if not g.is_valid:g=g.buffer(0)
    g=set_precision(g,0.000001)
    assert g.is_valid and not g.is_empty
    if g.geom_type == 'Polygon': g = {'type':'MultiPolygon','coordinates':[mapping(g)['coordinates']]}
    else: g = mapping(g)
    return json.loads(json.dumps(g), parse_float=lambda x:round(float(x),6))

def feature(g,p):
    return {'type':'Feature','properties':p,'bbox':list(g.bounds),'geometry':geometry(g)}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=pathlib.Path);parser.add_argument('--retrieved',required=True,help='UTC retrieval date YYYY-MM-DD')
    args=parser.parse_args();datetime.date.fromisoformat(args.retrieved)
    out=ROOT/'dist/data';out.mkdir(exist_ok=True)
    layers=collections.defaultdict(list)
    for sr in shapefile.Reader(str(args.source/FILES['counties'])).iterShapeRecords():
        p=sr.record.as_dict()
        if p['STATEFP']=='06' and p['COUNTYFP'] in COUNTIES:
            layers['counties'].append(feature(shape(sr.shape.__geo_interface__),{'id':p['GEOID'],'name':p['NAME']}))
    assert len(layers['counties'])==10,'Incomplete county download'
    region=unary_union([shape(f['geometry']) for f in layers['counties']])
    for kind in ['cities','districts']:
        for sr in shapefile.Reader(str(args.source/FILES[kind])).iterShapeRecords():
            p=sr.record.as_dict()
            if p['STATEFP']!='06' or (kind=='cities' and p['LSAD'] not in ['25','43']):continue
            g=shape(sr.shape.__geo_interface__)
            if not g.intersection(region).area>0.000001:continue
            name=p.get('NAME') if kind=='cities' else 'CA-'+p['CD119FP']
            c=g.representative_point()
            layers[kind].append(feature(g,{'id':p['GEOID'],'name':name,'center':[round(c.x,6),round(c.y,6)]}))
    water=json.loads((args.source/FILES['water']).read_text())
    assert 'features' in water and not water.get('exceededTransferLimit') and not water.get('properties',{}).get('exceededTransferLimit'),'Incomplete water download'
    groups=collections.defaultdict(list);metadata={}
    for f in water['features']:
        p=f['properties']
        if p['VERIFIED_STATUS']!='Verified' or p['BOUNDARY_TYPE']!='Water Service Area' or p['ACTIVITY_STATUS_CD'].strip()!='A' or not p['DT_VERIFIED']:continue
        g=shape(f['geometry'])
        if not g.is_valid:g=g.buffer(0)
        if not g.intersection(region).area>0.00000001:continue
        key=p['WATER_SYSTEM_NUMBER'];groups[key].append(g);metadata[key]=p
    for key,gs in groups.items():
        p=metadata[key]
        layers['water'].append(feature(unary_union(gs),{'id':key,'name':p['WATER_SYSTEM_NAME'].strip(),'verifiedAt':datetime.datetime.fromtimestamp(p['DT_VERIFIED']/1000,datetime.timezone.utc).date().isoformat()}))
    sources=[]
    for kind,filename in FILES.items():
        url=WATER_URL if kind=='water' else 'https://www2.census.gov/geo/tiger/GENZ2025/shp/'+filename
        source={'id':kind,'url':url,'retrievedAt':args.retrieved,'sha256':hashlib.sha256((args.source/filename).read_bytes()).hexdigest(),'features':len(layers[kind]),'vintage':'119th Congress (2025–2026)' if kind=='districts' else '2025' if kind!='water' else 'Verified active retail service areas'}
        sources.append(source)
        payload={'type':'FeatureCollection','source':source,'features':sorted(layers[kind],key=lambda f:f['properties']['id'])}
        (out/(kind+'.geojson')).write_text(json.dumps(payload,separators=(',',':'))+'\n')
    manifest={'version':1,'retrievedAt':args.retrieved,'counties':[f['properties']['name'] for f in layers['counties']],'sources':sources,'boundaryReviewMeters':100,'waterBoundaryReviewMeters':25,'notes':'Generalized cartographic boundaries; not parcel or asset ownership. Congressional vintage is current 119th Congress, not a future election map.'}
    (out/'sources.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({k:len(v) for k,v in layers.items()}))

if __name__=='__main__':main()

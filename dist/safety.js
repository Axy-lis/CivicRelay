// Official contacts are handoffs, not API delivery or dispatch integrations.
export const SAFETY_DIRECTORY=[
 {id:'0644000',kind:'safety-city',name:'Los Angeles Police Department',url:'https://www.lapdonline.org/contact-us/',phone:'18772755273'},
 {id:'0666000',kind:'safety-city',name:'San Diego Police Department',url:'https://www.sandiego.gov/police/services/file-police-report',phone:'16195312000'},
 {id:'06037',kind:'safety-county',name:"Los Angeles County Sheriff's Department",url:'https://lasd.org/lasd-phone-directory/'},
 {id:'06059',kind:'safety-county',name:"Orange County Sheriff's Department",url:'https://www.ocsheriff.gov/contact-us'},
 {id:'06065',kind:'safety-county',name:"Riverside County Sheriff's Office",url:'https://www.riversidesheriff.org/428/Who-to-Call'},
 {id:'06071',kind:'safety-county',name:"San Bernardino County Sheriff's Department",url:'https://wp.sbcounty.gov/sheriff/'},
 {id:'06073',kind:'safety-county',name:"San Diego County Sheriff's Office",url:'https://www.sdsheriff.gov/i-want-to/report',phone:'18588683200'}
].map(x=>({...x,categories:['safety'],checkedAt:'2026-10-24',delivery:'manual',phoneLabel:'Non-emergency contact'}));
export const SAFETY_NOTICE='Civic Relay is not monitored for emergencies and does not dispatch police. Saving here does not file a police report or notify law enforcement.';
export const SAFETY_ACK='This is not an emergency or an incident needing an immediate response. I understand that saving here does not notify police.';
export const routeStamp=d=>[d.category,d.lat,d.lng,d.nonEmergencyConfirmed===true].join('|');

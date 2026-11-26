// Pure safety checks for the explicitly manual hosted Auth exercise.
// Never import or read credentials here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIXTURE=/^sabora-auth-probe-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@example\.com$/i;
const BROWSER_ENV=['PATH','HOME','USERPROFILE','SYSTEMROOT','WINDIR','TMP','TEMP','TMPDIR','LANG','LC_ALL','DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','XDG_CACHE_HOME','LD_LIBRARY_PATH'];
export function isolatedBrowserEnvironment(environment,excluded=[]){
 const allowed={};
 for(const name of BROWSER_ENV){
  const value=environment[name];
  if(typeof value==='string'&&!excluded.some(key=>typeof key==='string'&&key.length>0&&value.includes(key)))allowed[name]=value;
 }
 return allowed;
}
export function isDisposableIdentity(user,email,subject){
 return typeof email==='string'&&FIXTURE.test(email)&&user?.email===email&&UUID.test(user?.id??'')&&
  (subject===undefined||user.id===subject);
}
export function findDisposableIdentity(users,email){
 if(!Array.isArray(users)||typeof email!=='string'||!FIXTURE.test(email))throw Error('fixture_reconciliation_invalid');
 const matches=users.filter(user=>user?.email===email);
 if(matches.length>1||matches.some(user=>!isDisposableIdentity(user,email)))throw Error('fixture_reconciliation_ambiguous');
 return matches.length===1?matches[0].id:null;
}

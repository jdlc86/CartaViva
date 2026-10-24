// Catalog reader uses a dedicated NOINHERIT login, provisioned outside the API.
// This function validates configuration without opening connections.
export function readCatalogPoolConfig(env={}){
 const host=env.SABORA_CATALOG_DB_HOST;
 const database=env.SABORA_CATALOG_DB_NAME;
 const user=env.SABORA_CATALOG_DB_USER;
 const password=env.SABORA_CATALOG_DB_PASSWORD;
 const ca=env.SABORA_CATALOG_DB_CA_PEM;
 const port=Number(env.SABORA_CATALOG_DB_PORT??5432);
 if(![host,database,user,password,ca].every(v=>typeof v==='string'&&v.trim().length>0)||
    !Number.isSafeInteger(port)||port<1||port>65535||
    /[\s/@:]/.test(host)||/[\s/@:]/.test(user)||
    user!=='sabora_catalog_login'||
    !ca.includes('-----BEGIN CERTIFICATE-----')||
    !ca.includes('-----END CERTIFICATE-----'))throw Error('invalid_catalog_pool_config');
 return Object.freeze({host,port,database,user,password,
  ssl:Object.freeze({ca,rejectUnauthorized:true}),
  max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,allowExitOnIdle:false});
}

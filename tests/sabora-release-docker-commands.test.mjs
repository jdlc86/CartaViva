import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedDockerCommands,inspectResolvedSaboraCompose} from '../scripts/ops/sabora-release-docker-commands.mjs';
const sha='d'.repeat(40);
test('Sabora-only host command plan: full immutable image/compose/3-services, deny global and unrelated operations',()=>{
 const dir='/srv/sabora/release/bundles/SABORA-LAB-0001';
 const root='/srv/sabora/release/bundles';
 const p=scopedDockerCommands({stageDir:dir,stageRoot:root,sha});
 assert.match(p.up.stdin,/sabora-web:d{40}/);
 assert.deepEqual(p.load('api').argv,['image','load','--input',dir+'/api.tar']);
 assert.deepEqual(p.inspect('web').argv,['image','inspect','sabora-web:'+sha,
  '--format','{{.Id}}']);
 assert.ok(p.up.argv.includes('--no-build'));
 assert.ok(p.up.argv.includes('--no-deps'));
 assert.ok(p.up.argv.includes('never'));
 assert.deepEqual(p.up.argv.slice(-3),['sabora-egress','api','web']);
 assert.equal(p.config.argv[0],'compose');
 for(const command of [p.config,p.up,p.inspect('api'),p.inspect('web'),p.load('api'),p.load('web'),p.status]){
  assert.ok(!command.argv.some(x=>['down','prune','rm','restart','build','systemctl','sudo'].includes(x)));
  assert.ok(!command.argv.some(x=>/fleetia/i.test(x)));
 }
 assert.throws(()=>scopedDockerCommands({stageDir:'/tmp/foreign',stageRoot:root,sha}),/unapproved_filesystem_scope/);
 assert.throws(()=>scopedDockerCommands({stageDir:root,stageRoot:root,sha}),/unapproved_filesystem_scope/);
 assert.throws(()=>scopedDockerCommands({stageDir:dir,stageRoot:root,sha:'bad'}),/unapproved_filesystem_scope/);
 assert.throws(()=>p.load('another'),/invalid_image_type/);
 const service=(name,network,image,ports)=>({image:'sabora-'+image+':'+sha,
  read_only:true,cap_drop:['ALL'],networks:Object.fromEntries(network.map(x=>[x,null])),
  ports,healthcheck:{test:['CMD','true']}});
 const api=service('api',['sabora_runtime_internal'],'api',
  [{target:4100,published:'4100',host_ip:'127.0.0.1',protocol:'tcp'}]);
 const gate=service('sabora-egress',['sabora_runtime_internal','sabora_egress_allowlisted'],'api',[]);
 const web=service('web',['sabora_runtime_internal','sabora_ingress_filtered'],'web',
  [{target:8443,published:'8443',host_ip:'146.59.145.64',protocol:'tcp'}]);
 const cfg={name:'sabora',services:{api,'sabora-egress':gate,web},
  networks:{sabora_runtime_internal:{name:'sabora_sabora_runtime_internal',internal:true},
   sabora_ingress_filtered:{name:'sabora_ingress_filtered',external:true},
   sabora_egress_allowlisted:{name:'sabora_egress_filtered',external:true}}};
 const view=inspectResolvedSaboraCompose(cfg,sha);
 assert.equal(view.unsafeOptionsPresent,false);
 assert.deepEqual(view.services,['sabora-egress','api','web']);
 for(const bad of [
  {...cfg,name:'another'},
  {...cfg,services:{...cfg.services,unrelated:api}},
  {...cfg,services:{...cfg.services,web:{...web,privileged:true}}},
  {...cfg,services:{...cfg.services,web:{...web,ports:[{...web.ports[0],host_ip:'0.0.0.0'}]}}},
  {...cfg,services:{...cfg.services,api:{...api,networks:{...api.networks,foreign:null}}}},
  {...cfg,networks:{...cfg.networks,sabora_egress_allowlisted:{...cfg.networks.sabora_egress_allowlisted,external:false}}}
 ])assert.throws(()=>inspectResolvedSaboraCompose(bad,sha),/sabora_docker_command_stop:/);
});

// Only entry to the single real controller integration, with disposable context
// checked before importing the provisioning fixture. Never packaged for hosts.
if(process.platform!=='linux'||process.getuid()!==0||process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'||
 process.env.SABORA_DISPOSABLE_RELEASE_LAB!=='explicitly-authorized-ci'||!/^\d+$/.test(process.env.GITHUB_RUN_ID??'')||
 !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA??'')||!process.env.RUNNER_TEMP)
 throw Error('sabora_lab_stop:disposable_root_runner_required');
await import('./sabora-release-controller-lab.mjs');

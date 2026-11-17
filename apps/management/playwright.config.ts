import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
 testDir:'./e2e',
 timeout:30_000,
 expect:{timeout:5_000},
 fullyParallel:false,
 forbidOnly:!!process.env.CI,
 retries:process.env.CI?1:0,
 workers:1,
 reporter:[['list'],['html',{outputFolder:'playwright-report',open:'never'}]],
 outputDir:'test-results',
 use:{baseURL:'http://127.0.0.1:4180',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[
  {name:'mobile-390',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844}}},
  {name:'desktop-1440',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}}
 ]
});

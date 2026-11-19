// Only the dedicated sudo rule may execute this root-owned, non-setuid binary.
#define _GNU_SOURCE
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <sys/stat.h>
int main(int argc,char **argv){
 (void)argv;
 if(argc!=1||geteuid()!=0){fputs("sabora_controller_stop:entry_denied\n",stderr);return 1;}
 clearenv();umask(077);
 if(chdir("/etc/sabora/release"))return 1;
 char *args[]={"/etc/sabora/release/bin/node","/etc/sabora/release/code/scripts/ops/sabora-release-root-entry.mjs",NULL};
 char *env[]={"PATH=/usr/bin:/bin","HOME=/etc/sabora/release","LANG=C","LC_ALL=C",NULL};
 execve(args[0],args,env);return 1;
}

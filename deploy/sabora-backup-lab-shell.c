// CI-only restricted login shell. Not setuid, no sudo, no command parsing.
// Deliberately impossible to compile without the disposable fixture identity.
#define _GNU_SOURCE
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <sys/stat.h>
#include <sys/prctl.h>
#ifndef SABORA_BACKUP_LAB_BASE
#error disposable fixture path required
#endif
#ifndef SABORA_BACKUP_LAB_UID
#error disposable fixture uid required
#endif
#ifndef SABORA_BACKUP_LAB_GID
#error disposable fixture gid required
#endif
#define SHELL_PATH SABORA_BACKUP_LAB_BASE "/bin/receive"
#define NODE_PATH SABORA_BACKUP_LAB_BASE "/bin/node"
#define ENTRY_PATH SABORA_BACKUP_LAB_BASE "/code/scripts/ops/sabora-backup-governed-lab-entry.mjs"
static int deny(void){fputs("sabora_backup_lab_shell_stop:denied\n",stderr);return 1;}
int main(int argc,char **argv){
 if(!SABORA_BACKUP_LAB_UID||getuid()!=SABORA_BACKUP_LAB_UID||
    geteuid()!=SABORA_BACKUP_LAB_UID||getgid()!=SABORA_BACKUP_LAB_GID||
    getegid()!=SABORA_BACKUP_LAB_GID||argc!=3||strcmp(argv[1],"-c")||
    strcmp(argv[2],SHELL_PATH))return deny();
 const char *original=getenv("SSH_ORIGINAL_COMMAND");
 if(!original||strcmp(original,"sabora-backup-receive-v1"))return deny();
 if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0))return deny();
 if(clearenv())return deny();
 umask(077);
 char *args[]={NODE_PATH,ENTRY_PATH,NULL};
 char *env[]={"PATH=/usr/bin:/bin","LANG=C",NULL};
 execve(NODE_PATH,args,env);
 return deny();
}

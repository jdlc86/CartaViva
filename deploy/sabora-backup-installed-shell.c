// Production-candidate restricted login shell. NOT setuid and not an
// installer. Compile with the separately reserved dedicated UID and GID.
// No fixture identity, shell parser, command arguments or sudo.
#define _GNU_SOURCE
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <sys/stat.h>
#include <sys/prctl.h>
#ifndef SABORA_BACKUP_UID
#error reserved backup uid required
#endif
#ifndef SABORA_BACKUP_GID
#error reserved backup gid required
#endif
_Static_assert(SABORA_BACKUP_UID>0 && SABORA_BACKUP_UID!=10001,"non-application backup uid required");
_Static_assert(SABORA_BACKUP_GID>0 && SABORA_BACKUP_GID!=10001,"non-application backup gid required");
#define BASE "/etc/sabora/backup"
#define SHELL_PATH BASE "/bin/receive"
#define NODE_PATH BASE "/bin/node"
#define ENTRY_PATH BASE "/code/scripts/ops/sabora-backup-installed-entry.mjs"
static int deny(void){fputs("sabora_backup_installed_shell_stop:denied\n",stderr);return 1;}
int main(int argc,char **argv){
 if(getuid()!=SABORA_BACKUP_UID||geteuid()!=SABORA_BACKUP_UID||
    getgid()!=SABORA_BACKUP_GID||getegid()!=SABORA_BACKUP_GID||
    argc!=3||strcmp(argv[1],"-c")||strcmp(argv[2],SHELL_PATH))return deny();
 const char *original=getenv("SSH_ORIGINAL_COMMAND");
 if(!original||strcmp(original,"sabora-backup-receive-v1"))return deny();
 if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)||clearenv())return deny();
 umask(077);
 char *args[]={NODE_PATH,ENTRY_PATH,NULL};
 char *env[]={"PATH=/usr/bin:/bin","LANG=C",NULL};
 execve(NODE_PATH,args,env);
 return deny();
}

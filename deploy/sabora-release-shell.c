// Dedicated login shell, NOT setuid. sshd must invoke exactly our forced command.
// No shell parsing; original request is bounded data on stdin of fixed sudo argv.
#define _GNU_SOURCE
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <sys/wait.h>
#include <signal.h>
#include <errno.h>
#include <sys/stat.h>
static void deny(void){fputs("sabora_ssh_stop:request_denied\n",stderr);exit(1);}
static void sendall(int fd,const char *p,size_t n){while(n){ssize_t k=write(fd,p,n);if(k<0&&errno==EINTR)continue;if(k<=0)deny();p+=k;n-=k;}}
int main(int argc,char **argv){
 if(geteuid()==0||argc!=3||strcmp(argv[1],"-c")||strcmp(argv[2],"/etc/sabora/release/bin/ssh-entry"))deny();
 const char *original=getenv("SSH_ORIGINAL_COMMAND");
 if(!original||!strlen(original)||strlen(original)>300||strchr(original,'\n')||strchr(original,'\r'))deny();
 char command[301];strcpy(command,original);clearenv();umask(077);alarm(300);
 int fds[2];if(pipe(fds))deny();pid_t child=fork();if(child<0)deny();
 if(!child){close(fds[1]);if(dup2(fds[0],STDIN_FILENO)<0)_exit(1);close(fds[0]);
  char *args[]={"/usr/bin/sudo","-n","--","/etc/sabora/release/bin/root-entry",NULL};
  char *env[]={"PATH=/usr/bin:/bin","LANG=C",NULL};execve(args[0],args,env);_exit(1);}
 close(fds[0]);sendall(fds[1],command,strlen(command));sendall(fds[1],"\n",1);
 char buf[65536];size_t total=0;ssize_t n;
 while((n=read(STDIN_FILENO,buf,sizeof(buf)))>0){total+=(size_t)n;if(total>1611200000ULL){kill(child,SIGTERM);deny();}sendall(fds[1],buf,(size_t)n);}
 close(fds[1]);int status;if(waitpid(child,&status,0)<0)deny();
 return WIFEXITED(status)?WEXITSTATUS(status):1;
}

// Local Windows-only OS ACL verification for the offline Sabora signer.
// The caller must supply an independently approved digest for the private
// key ACL. A 64-character environment string alone is NEVER proof of safety.
// No private-key bytes, passwords, output paths or ACL details are printed.
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

const HASH=/^[0-9a-f]{64}$/;
const POWERSHELL=`
$ErrorActionPreference='Stop'
$p=[System.Text.Encoding]::UTF8.GetString(
 [System.Convert]::FromBase64String($env:SABORA_NTFS_PATH_B64))
if ([System.IO.Directory]::Exists($p)) {
 $acl=[System.IO.Directory]::GetAccessControl($p)
} else {
 $acl=[System.IO.File]::GetAccessControl($p)
}
if (-not $acl.AreAccessRulesProtected) { throw 'inherited_dacl' }
$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
if ($owner -ne $me) { throw 'unexpected_owner' }
$allowed=@($me,'S-1-5-18','S-1-5-32-544')
$rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]))
if ($rules.Count -lt 1) { throw 'empty_dacl' }
$hasOwnerAllow=$false
foreach ($rule in $rules) {
 if ($rule.IsInherited -or $rule.IdentityReference.Value -notin $allowed) {
  throw 'unexpected_acl_principal'
 }
 if ($rule.IdentityReference.Value -eq $me -and
     $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow) {
  $hasOwnerAllow=$true
 }
}
if (-not $hasOwnerAllow) { throw 'owner_without_access' }
$sddl=$acl.GetSecurityDescriptorSddlForm(
 [System.Security.AccessControl.AccessControlSections]::Access)
$bytes=[System.Text.Encoding]::UTF8.GetBytes($sddl)
$sha=[System.Security.Cryptography.SHA256]::Create()
try { $digest=$sha.ComputeHash($bytes) }
finally { $sha.Dispose() }
[Console]::Out.WriteLine(
 [System.BitConverter]::ToString($digest).Replace('-','').ToLowerInvariant())
`;
export function verifiedNtfsAclDigest(path){
 if(process.platform!=='win32')throw Error('sabora_ntfs_acl_stop:windows_only');
 if(typeof path!=='string'||!path)throw Error('sabora_ntfs_acl_stop:invalid_path');
 const executable=join(process.env.SystemRoot??'C:\\Windows','System32',
  'WindowsPowerShell','v1.0','powershell.exe');
 const code=Buffer.from(POWERSHELL,'utf16le').toString('base64');
 const env={...process.env,SABORA_NTFS_PATH_B64:Buffer.from(path,'utf8').toString('base64')};
 const r=spawnSync(executable,['-NoProfile','-NonInteractive','-EncodedCommand',code],
  {encoding:'utf8',windowsHide:true,env,timeout:15000,maxBuffer:2048});
 const digest=r.stdout?.trim()??'';
 if(r.error||r.status!==0||!HASH.test(digest))
  throw Error('sabora_ntfs_acl_stop:effective_dacl_unverified');
 return digest;
}

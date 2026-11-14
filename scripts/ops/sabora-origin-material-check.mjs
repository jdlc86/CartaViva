#!/usr/bin/env node
// Sabora-only local material check. Never sends certs or keys over a network.
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { X509Certificate, createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';

function stop(reason) {
  process.stderr.write(`SABORA_ORIGIN_MATERIAL_STOP:${reason}\n`);
  process.exit(1);
}

const [certificatePath, privateKeyPath, customerHost, managementHost] = process.argv.slice(2);
if (process.argv.length !== 6) stop('expected_cert_key_and_two_hosts');
function verifyHost(host) {
  if (typeof host !== 'string' || !/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    stop('invalid_hostname');
  }
}
verifyHost(customerHost);
verifyHost(managementHost);
if (customerHost === managementHost) stop('duplicate_origin');

function readBoundedRegularFile(path) {
  if (!path || !path.startsWith('/')) stop('absolute_file_path_required');
  const name = resolve(path);
  let stat;
  try { stat = lstatSync(name); } catch { stop('file_missing'); }
  if (!stat.isFile() || stat.isSymbolicLink()) stop('regular_nonsymlink_file_required');
  if (stat.size < 1 || stat.size > 131072) stop('file_size_invalid');
  try { return readFileSync(name); } catch { stop('file_unreadable'); }
}

const certBytes = readBoundedRegularFile(certificatePath);
const keyBytes = readBoundedRegularFile(privateKeyPath);
let certificate, privateKey;
try { certificate = new X509Certificate(certBytes); } catch { stop('certificate_parse_failed'); }
try { privateKey = createPrivateKey(keyBytes); } catch { stop('unencrypted_private_key_parse_failed'); }

const altNames = certificate.subjectAltName?.split(',').map(item => item.trim()) ?? [];
const required = [`DNS:${customerHost}`, `DNS:${managementHost}`];
if (altNames.length !== 2 || new Set(altNames).size !== 2 || required.some(item => !altNames.includes(item))) {
  stop('unexpected_subject_alt_names');
}

const notBefore = Date.parse(certificate.validFrom);
const notAfter = Date.parse(certificate.validTo);
const now = Date.now();
if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter) || now < notBefore || now + 7 * 86400000 >= notAfter) {
  stop('certificate_expired_not_yet_valid_or_expiring_within_7d');
}
let pubFromCert, pubFromKey;
try {
  pubFromCert = certificate.publicKey.export({ type: 'spki', format: 'der' });
  pubFromKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
} catch { stop('public_key_parse_failed'); }
if (pubFromCert.length !== pubFromKey.length || !timingSafeEqual(pubFromCert, pubFromKey)) stop('certificate_private_key_mismatch');

process.stdout.write('PASS: Sabora certificate/key pair, exact two SAN hosts and validity window.\n');
process.stdout.write('This is LOCAL material validation only: Cloudflare CA trust, server installation, firewall and HTTPS remain UNVERIFIED.\n');

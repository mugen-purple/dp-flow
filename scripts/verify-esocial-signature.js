const crypto = require('node:crypto');
const { DOMParser } = require('@xmldom/xmldom');
const { SignedXml } = require('xml-crypto');
const { buildS1299Event, signEventXml } = require('../src/main/integrations/esocial/esocial-xml');

function findSignature(document) {
  const nodes = document.getElementsByTagName('*');
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index].localName === 'Signature') {
      return nodes[index];
    }
  }
  return null;
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const eventXml = buildS1299Event({
  id: 'ID000000000000000000000000000000000000001',
  cnpj: '12345678000100',
  period: '2025-01'
});
const signedXml = signEventXml(eventXml, {
  privateKeyPem: privateKey,
  certificatePem: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----'
});
const document = new DOMParser().parseFromString(signedXml, 'text/xml');
const signatureNode = findSignature(document);

if (!signatureNode) {
  throw new Error('Signature nao encontrada no XML assinado.');
}

const verifier = new SignedXml({ publicCert: publicKey });
verifier.loadSignature(signatureNode);
const valid = verifier.checkSignature(signedXml);

console.log(JSON.stringify({
  signedXmlLength: signedXml.length,
  signatureFound: true,
  references: verifier.references.map((reference) => ({
    uri: reference.uri,
    digestAlgorithm: reference.digestAlgorithm,
    transforms: reference.transforms
  })),
  signatureAlgorithm: verifier.signatureAlgorithm,
  canonicalizationAlgorithm: verifier.canonicalizationAlgorithm,
  valid,
  validationErrors: verifier.validationErrors
}, null, 2));

if (!valid) {
  process.exitCode = 1;
}
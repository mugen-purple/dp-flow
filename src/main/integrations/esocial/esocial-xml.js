const crypto = require('node:crypto');
const { DOMParser } = require('@xmldom/xmldom');
const { SignedXml } = require('xml-crypto');

const addressingNamespace = 'http://schemas.xmlsoap.org/ws/2004/08/addressing';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildS1299Event({ id, cnpj, period, environment = 'RESTRICTED' }) {
  const eventId = id || `ID${Date.now()}`;
  const environmentCode = environment === 'PRODUCTION' ? '1' : '2';
  return `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><evtFechaEvPer Id="${escapeXml(eventId)}"><ideEvento><indApuracao>1</indApuracao><perApur>${escapeXml(period)}</perApur><tpAmb>${environmentCode}</tpAmb><procEmi>1</procEmi><verProc>DPFlow-0.1.0</verProc></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${escapeXml(cnpj.replace(/\D/g, '').slice(0, 8))}</nrInsc></ideEmpregador><infoFech><evtRemun>N</evtRemun><evtPgtos>N</evtPgtos><evtComProd>N</evtComProd><evtContratAvNP>N</evtContratAvNP><evtInfoComplPer>N</evtInfoComplPer></infoFech></evtFechaEvPer></eSocial>`;
}

function signEventXml(xml, { privateKeyPem, certificatePem }) {
  if (!privateKeyPem || !certificatePem) {
    throw new Error('Certificado e chave privada PEM sao obrigatorios para assinar o evento eSocial.');
  }

  const certificate = certificatePem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '');
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  const eventNode = document.getElementsByTagNameNS('*', 'evtFechaEvPer')[0];
  const eventId = eventNode?.getAttribute('Id');
  if (!eventId) {
    throw new Error('O evento evtFechaEvPer precisa de um atributo Id para assinatura.');
  }
  const signature = new SignedXml({
    privateKey: privateKeyPem,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certificate}</X509Certificate></X509Data>`
  });
  const canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
  signature.addReference({
    xpath: "//*[local-name(.)='evtFechaEvPer']",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', canonicalizationAlgorithm],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    uri: eventId
  });
  signature.canonicalizationAlgorithm = canonicalizationAlgorithm;
  signature.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  signature.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='eSocial']", action: 'append' }
  });
  return signature.getSignedXml();
}

function buildSendEnvelope(signedEvent, batchId, representedCnpj, transmitterCnpj) {
  const employerRegistration = representedCnpj.replace(/\D/g, '').slice(0, 8);
  const transmitterRegistration = transmitterCnpj.replace(/\D/g, '').slice(0, 8);
  const action = 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0/ServicoEnviarLoteEventos/EnviarLoteEventos';
  const batch = `<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><envioLoteEventos grupo="3"><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${escapeXml(employerRegistration)}</nrInsc></ideEmpregador><ideTransmissor><tpInsc>1</tpInsc><nrInsc>${escapeXml(transmitterRegistration)}</nrInsc></ideTransmissor><eventos><evento Id="${escapeXml(batchId)}">${signedEvent}</evento></eventos></envioLoteEventos></eSocial>`;
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body><EnviarLoteEventos xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0"><loteEventos>${batch}</loteEventos></EnviarLoteEventos></soap:Body></soap:Envelope>`;
}

function buildQueryEnvelope(protocol) {
  const action = 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0/ServicoConsultarLoteEventos/ConsultarLoteEventos';
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body><ConsultarLoteEventos xmlns="http://www.esocial.gov.br/servicos/empregador/consultarloteeventos"><consultaLoteEventos><protocoloEnvio>${escapeXml(protocol)}</protocoloEnvio></consultaLoteEventos></ConsultarLoteEventos></soap:Body></soap:Envelope>`;
}

module.exports = { buildS1299Event, signEventXml, buildSendEnvelope, buildQueryEnvelope };
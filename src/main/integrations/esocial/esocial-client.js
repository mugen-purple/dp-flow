const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { app } = require('electron');

const endpoints = {
  RESTRICTED: {
    send: 'https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc',
    query: 'https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc'
  },
  PRODUCTION: {
    send: 'https://webservices.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc',
    query: 'https://webservices.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc'
  }
};

const soapActions = {
  send: 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0/ServicoEnviarLoteEventos/EnviarLoteEventos',
  query: 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0/ServicoConsultarLoteEventos/ConsultarLoteEventos'
};

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)</[^>]*${tag}>`, 'i'));
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : null;
}

function request(url, body, certificate, soapAction) {
  validateSoapBody(body);
  saveSanitizedRequest(body);
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      pfx: certificate.pfxPath ? fs.readFileSync(certificate.pfxPath) : undefined,
      passphrase: certificate.passphrase,
      key: certificate.keyPem,
      cert: certificate.certificatePem,
      rejectUnauthorized: true,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body), SOAPAction: `"${soapAction}"` }
    };
    const httpRequest = https.request(requestOptions, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`eSocial respondeu HTTP ${response.statusCode}: ${responseBody.slice(0, 300)}`));
          return;
        }
        resolve(responseBody);
      });
    });
    httpRequest.on('error', reject);
    httpRequest.write(body);
    httpRequest.end();
  });
}

function saveSanitizedRequest(body) {
  const sanitized = body.replace(/<X509Certificate>[\s\S]*?<\/X509Certificate>/gi, '<X509Certificate>[REMOVED]</X509Certificate>')
    .replace(/<SignatureValue>[\s\S]*?<\/SignatureValue>/gi, '<SignatureValue>[REMOVED]</SignatureValue>');
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'esocial-last-request.xml'), sanitized, 'utf8');
  } catch (error) {
    console.warn('Nao foi possivel salvar o XML sanitizado do eSocial:', error.message);
  }
}

function validateSoapBody(body) {
  if (typeof body !== 'string' || !body.trim()) {
    throw new Error('O envelope SOAP do eSocial esta vazio.');
  }
  const openTags = [];
  const tokenPattern = /<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\/?\s*>/g;
  for (const match of body.matchAll(tokenPattern)) {
    const token = match[0];
    const tagName = match[1];
    if (token.startsWith('<?') || token.startsWith('<!') || token.endsWith('/>')) continue;
    if (token.startsWith('</')) {
      if (openTags.pop() !== tagName) throw new Error(`Envelope SOAP invalido: fechamento inesperado de ${tagName}.`);
    } else {
      openTags.push(tagName);
    }
  }
  if (openTags.length) throw new Error(`Envelope SOAP invalido: tag ${openTags[openTags.length - 1]} sem fechamento.`);
  if (!/<soap:Envelope\b[^>]*xmlns:soap="http:\/\/schemas\.xmlsoap\.org\/soap\/envelope\/"/i.test(body)) {
    throw new Error('Envelope SOAP invalido: namespace SOAP 1.1 ausente.');
  }
  if (!/<evtFechaEvPer\b[^>]*\bId="ID1[0-9]{14}[0-9]{14}[0-9]{5}"/i.test(body)) {
    throw new Error('Evento S-1299 invalido: Id fora do formato oficial.');
  }
}

function createEsocialClient() {
  return {
    async send({ environment = 'RESTRICTED', body, certificate }) {
      if (!certificate?.pfxPath && (!certificate?.keyPem || !certificate?.certificatePem)) {
        throw new Error('Configure um certificado A1 PFX ou um par PEM para comunicar com o eSocial.');
      }
      const responseXml = await request(endpoints[environment].send, body, certificate, soapActions.send);
      return { responseXml, protocol: extractTag(responseXml, 'protocoloEnvio') };
    },
    async query({ environment = 'RESTRICTED', body, certificate }) {
      const responseXml = await request(endpoints[environment].query, body, certificate, soapActions.query);
      return { responseXml, status: extractTag(responseXml, 'cdResposta') || extractTag(responseXml, 'descResposta') };
    }
  };
}

module.exports = { createEsocialClient, endpoints };
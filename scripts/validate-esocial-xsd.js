const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const {
  buildS1299Event,
  signEventXml,
  buildSendEnvelope
} = require('../src/main/integrations/esocial/esocial-xml');

const schemaRoot = 'C:\\Users\\davia\\AppData\\Local\\Temp\\dp-flow-sped-esocial-extract\\sped-esocial-master';
const eventSchema = path.join(schemaRoot, 'schemes', 'v_S_01_03_00', 'evtFechaEvPer.xsd');
const batchSchema = path.join(schemaRoot, 'schemes', 'comunicacao', 'v1_1_0', 'EnvioLoteEventos-v1_1_0.xsd');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function extractElement(xml, localName) {
  const document = new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } }).parseFromString(xml, 'text/xml');
  const elements = document.getElementsByTagNameNS('*', localName);
  if (!elements.length) {
    throw new Error(`Elemento ${localName} nao encontrado.`);
  }
  return new XMLSerializer().serializeToString(elements[0]);
}

function validateWithJava(xmlPath, xsdPath, workDirectory) {
  const javaSource = path.join(workDirectory, 'ValidateXsd.java');
  fs.writeFileSync(javaSource, `
import java.io.File;
import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.SchemaFactory;

public class ValidateXsd {
  public static void main(String[] args) throws Exception {
    SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
    factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "file");
    var schema = factory.newSchema(new File(args[1]));
    var validator = schema.newValidator();
    validator.validate(new StreamSource(new File(args[0])));
  }
}
`, 'utf8');

  const compile = spawnSync('javac', [javaSource], { encoding: 'utf8' });
  if (compile.status !== 0) {
    throw new Error(`javac falhou:\n${compile.stderr || compile.stdout}`);
  }
  const result = spawnSync('java', ['-cp', workDirectory, 'ValidateXsd', xmlPath, xsdPath], {
    encoding: 'utf8'
  });
  return {
    valid: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  };
}

function main() {
  for (const schema of [eventSchema, batchSchema]) {
    if (!fs.existsSync(schema)) {
      throw new Error(`Schema nao encontrado: ${schema}`);
    }
  }

  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const eventId = 'ID1123456789012' + '123456789012345678901';
  const event = buildS1299Event({
    id: eventId,
    cnpj: '12345678000199',
    period: '2025-01',
    environment: 'RESTRICTED'
  });
  const signedEvent = signEventXml(event, {
    privateKeyPem,
    certificatePem: 'AQID'
  });
  const soap = buildSendEnvelope(
    signedEvent,
    'LOTE-20250101-000000000000000000000000000000',
    '12345678000199',
    '98765432000188'
  );

  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-flow-xsd-'));
  const signedEventPath = path.join(workDirectory, 'event.xml');
  const batchPath = path.join(workDirectory, 'batch.xml');
  fs.writeFileSync(signedEventPath, signedEvent, 'utf8');
  fs.writeFileSync(batchPath, extractElement(soap, 'eSocial'), 'utf8');

  const eventResult = validateWithJava(signedEventPath, eventSchema, workDirectory);
  const batchResult = validateWithJava(batchPath, batchSchema, workDirectory);
  console.log(JSON.stringify({
    files: { signedEventPath, batchPath },
    schemas: { eventSchema, batchSchema },
    event: eventResult,
    batch: batchResult
  }, null, 2));

  if (!eventResult.valid || !batchResult.valid) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  fail(error.stack || error.message);
}

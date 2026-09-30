# DP Flow

Fundacao local do DP Flow, um sistema de produtividade para rotinas de DP, RH, administracao e contabilidade.

## Stack inicial

- Electron: desktop local usando JavaScript e Node.js.
- SQLite nativo do runtime do Electron: banco local sem servidor externo e sem addon compilado separado.
- Renderer isolado por `preload` com `contextIsolation` e sem Node.js direto na interface.

## Executar

```powershell
npm.cmd install
npm.cmd start
```

Se a politica do PowerShell bloquear `npm`, use `npm.cmd` como nos comandos acima.

O banco e criado em `app.getPath('userData')/dp-flow.sqlite3`. Esse caminho e gerenciado pelo Electron e nao fica misturado ao codigo-fonte.

## Fundacao atual

- Shell desktop Electron.
- SQLite local com foreign keys habilitadas.
- Migracao inicial versionada.
- Tabelas base para empresas, tarefas, historico e configuracoes.
- Ponte segura entre renderer e processo principal.
- Tela inicial de verificacao da fundacao.
- Kanban de tarefas abertas com historico de tarefas concluidas por 30 dias.
- Conclusao manual e automatica sincronizada com os itens de checklist.
- Processos organizados dentro de uma unica tarefa: cada tarefa pode receber etapas em checklist e e concluida quando todas forem marcadas.

## Integração com Google Forms para admissões

A aba **Admissões** usa login OAuth oficial do Google. Para a usuária final, o fluxo é apenas clicar em **Conectar com Google**, escolher a conta, revisar as permissões e colar o link do Forms.

### Configuração técnica única

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto para o DP Flow. Isso é configuração do aplicativo, não da usuária final.
2. Ative **Google Forms API** e **Google Drive API**.
3. Configure a tela de consentimento OAuth com o nome, e-mail de suporte e e-mail do desenvolvedor.
4. Durante o desenvolvimento, deixe o app como **Em teste** e adicione os e-mails de teste. Essa etapa é somente temporária: nesse modo o Google bloqueia contas que não estão na lista e os tokens de teste podem expirar.
5. Para liberar o DP Flow para qualquer conta Google, mude o app para **Em produção** na tela de consentimento OAuth. Como o DP Flow solicita escopos sensíveis de Forms e Drive, envie o app para a verificação OAuth do Google quando o Console solicitar. Preencha a página inicial, a política de privacidade e explique no vídeo/demonstração como o app lê formulários, respostas e arquivos enviados.
6. Aguarde a aprovação do Google. Depois da aprovação, novas usuárias não precisam ser adicionadas manualmente como usuárias de teste.
7. Crie uma credencial OAuth do tipo **Aplicativo para computador**.
8. Configure as credenciais no ambiente local antes de iniciar o DP Flow. No PowerShell:

```powershell
$env:DP_FLOW_GOOGLE_CLIENT_ID = 'seu-client-id.apps.googleusercontent.com'
$env:DP_FLOW_GOOGLE_CLIENT_SECRET = 'seu-client-secret'
npm.cmd start
```

O código-fonte usa apenas essas variáveis de ambiente e não contém credenciais. Depois de reiniciar o DP Flow, a usuária final não verá esses valores na interface; ela apenas clicará em **Conectar com Google**, fará login e autorizará o acesso. Nunca faça commit de um arquivo `.env` ou de credenciais OAuth.

Enquanto a verificação não for concluída, o funcionamento fica limitado às contas cadastradas em **Usuários de teste**. Publicar o app sem concluir a verificação não elimina necessariamente os avisos nem libera todos os escopos sensíveis.

O aplicativo sincroniza manualmente pelo botão **Sincronizar respostas** e também a cada cinco minutos enquanto estiver aberto. O script usa `FormApp` e `DriveApp`, portanto a conta autorizada precisa ter acesso ao formulário e aos arquivos. Para documentos, use a pergunta nativa **Upload de arquivo**. Os arquivos baixados ficam em `admissions-files` dentro dos dados locais do aplicativo.

O DP Flow abre o login no navegador padrão e recebe o retorno em uma porta local. Nenhuma senha é armazenada. O aplicativo guarda apenas o refresh token localmente para sincronizar depois. Para revogar o acesso, remova o DP Flow na área de segurança da conta Google.

## Integração antiga com eSocial

A integração eSocial foi retirada da interface e dos pontos de entrada ativos do aplicativo. Os arquivos e tabelas históricas permanecem no projeto/banco para não apagar dados de versões anteriores, mas não são executados pelo DP Flow atual.

O eSocial nao oferece uma API REST publica para consultar uma procuração e ler o estado da folha pelo navegador. A integração de sistemas deve usar os Web Services SOAP oficiais, XML conforme os leiautes/XSD vigentes e assinatura digital aceita pelo eSocial.

O ambiente de testes oficial é a Produção Restrita. Os endpoints publicados pelo eSocial são:

- Envio de lotes: `https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc`
- Consulta de lotes: `https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc`

Para o cenário de escritório contábil, a empresa precisa cadastrar a procuração eletrônica no e-CAC com os perfis do eSocial. O serviço valida o assinante, o CNPJ/CPF representado e o perfil da procuração. O DP Flow deve receber o certificado por um mecanismo seguro do sistema operacional ou por um provedor autorizado; ele não deve armazenar senha, certificado ou token no SQLite.

O próximo adaptador deve:

1. Assinar XML conforme o Manual de Orientação do Desenvolvedor do eSocial.
2. Enviar o lote e persistir o protocolo.
3. Consultar o resultado do lote.
4. Criar evidência somente quando o retorno oficial confirmar o evento de fechamento, como S-1299.
5. Relacionar o CNPJ outorgante às empresas representadas somente após a autorização ser confirmada pelo serviço oficial.

No DP Flow, a ativação é feita informando o certificado/chave do usuário e selecionando a empresa representada já cadastrada com CNPJ. Não é necessário anexar um XML genérico da empresa para provar a procuração: o eSocial valida a assinatura e a procuração no processamento do evento. O aplicativo consulta automaticamente, a cada minuto, os protocolos de lotes enviados por ele. Ele não consegue descobrir eventos arbitrários feitos fora do DP Flow sem um protocolo consultável ou uma operação oficial de consulta disponibilizada para esse fim.

Quando um retorno oficial de S-1299 é confirmado, o DP Flow registra a evidência e conclui somente tarefas abertas da mesma empresa cujo título esteja relacionado a folha, eSocial ou fechamento.

Referências oficiais: [Documentação Técnica do eSocial](https://www.gov.br/esocial/pt-br/documentacao-tecnica), [Produção Restrita](https://www.gov.br/esocial/pt-br/acesso-ao-sistema/ambiente-de-producao-restrita) e [Procuração Eletrônica e Assinatura Digital](https://www.gov.br/esocial/pt-br/acesso-ao-sistema/orientacoes-assinatura-digital-e-procuracao-eletronica).

## Direcao arquitetural

`renderer (UI) -> preload (API minima) -> main/application -> repositories -> SQLite`

Integracoes futuras publicam eventos em uma camada de integracoes. O nucleo de tarefas consumira esses eventos por regras de negocio, sem conhecer detalhes de eSocial, folha ou outros provedores.

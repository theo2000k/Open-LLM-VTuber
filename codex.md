# Open-LLM-VTuber — Codex Execution Plan
# Persona + UI + Memory (Cohost VTuber)

Este arquivo contém uma sequência de PROMPTS que devem ser executados
UM POR VEZ pelo Codex no VS Code.

⚠️ REGRAS GERAIS PARA O CODEX
- NÃO execute comandos (pip, python, git) sem pedido explícito.
- NÃO remova funcionalidades existentes.
- NÃO invente features que não existam no código.
- Sempre diga quais arquivos serão alterados ANTES de alterar.
- Faça alterações pequenas e incrementais.
- Após cada etapa, pare e aguarde confirmação.

--------------------------------------------------
PROMPT 0 — CONTEXTO GLOBAL (EXECUTAR UMA ÚNICA VEZ)
--------------------------------------------------

Contexto:
Este repositório local será usado para criar uma VTuber de IA
no papel de cohost gamer (inspirada no conceito da Shogun, mas não uma cópia).

Objetivo final:
- Interface Web
- Avatar (Live2D)
- Entrada por texto e voz
- Saída por voz (TTS; RVC no futuro)
- Persona configurável via arquivo
- Memória persistente visível ao usuário

Regras importantes:
- Você está rodando como Codex no VS Code.
- NÃO execute comandos automaticamente.
- NÃO altere código ainda.
- Apenas analise o repositório neste passo.

Confirme quando terminar a análise inicial.

--------------------------------------------------
PROMPT 1A — MAPEAR ONDE O SYSTEM PROMPT É CONSTRUÍDO
--------------------------------------------------

Localize no código onde o prompt do LLM é montado.

Quero saber:
1) Quais arquivos e funções criam a lista de mensagens (system/user/assistant).
2) Onde entram:
   - regras globais
   - persona (se existir)
   - histórico
   - contexto da conversa
3) Como o projeto escolhe o comportamento padrão hoje.

Não altere nada.
Retorne apenas:
- caminhos de arquivos
- fluxo resumido (texto)

--------------------------------------------------
PROMPT 4A — MAPEAR MEMÓRIA ATUAL (ANTES DE MEXER)
--------------------------------------------------

Analise como o projeto lida com memória atualmente.

Quero respostas claras:
1) Existe histórico persistente? Onde fica?
2) Ele sobrevive a reinicialização?
3) Existe memória de longo prazo ou apenas histórico?
4) Existe forma atual de limpar histórico/memória?

Não implemente nada.
Somente mapeie arquivos, formatos e comportamento.

--------------------------------------------------
PROMPT 1B — CONECTAR PERSONA YAML AO SYSTEM PROMPT
--------------------------------------------------

Objetivo: carregar uma persona estruturada como System Prompt.

Antes de implementar:
- Mostre exatamente quais arquivos pretende alterar/criar.
- Explique o impacto.
- Aguarde confirmação.

Após confirmação, implemente:

Requisitos:
1) Criar arquivo `persona/cohost_vtuber.yaml` com a persona definida abaixo.
2) Criar um loader simples de persona (ex: utils/persona_loader.py).
3) Gerar um texto de system prompt a partir da persona.
4) Permitir escolher a persona via config (ex: ACTIVE_PERSONA_ID).
5) Se nenhuma persona for definida, manter comportamento atual.

Persona (usar exatamente esta):

persona:
  id: cohost_vtuber
  name: Akira
  role: AI VTuber Cohost

identity:
  description: >
    Akira é uma VTuber de IA que atua como cohost em lives de jogos.
    Ela comenta, reage e auxilia o streamer sem roubar protagonismo.

behavior:
  rules:
    - Nunca falar pelo streamer
    - Evitar monólogos longos
    - Priorizar comentários contextuais
    - Fazer perguntas curtas quando apropriado

languages:
  supported: [pt-BR, en-US, ja-JP]

memory:
  long_term: enabled
  short_term: enabled

--------------------------------------------------
PROMPT 2A — UI: VISUALIZAÇÃO DA PERSONA (READ-ONLY)
--------------------------------------------------

Criar uma seção na interface Web chamada “Persona”.

Funcionalidades:
- Mostrar ID e nome da persona ativa
- Mostrar o system prompt gerado (somente leitura)
- Mostrar o arquivo de origem da persona

Regras:
- Não expor API keys
- Integrar na UI existente de settings, se houver
- Se não existir, criar página simples

Entregáveis:
- Onde acessar na UI
- Arquivos alterados

--------------------------------------------------
PROMPT 4B — IMPLEMENTAR MEMÓRIA PERSISTENTE (FACTS)
--------------------------------------------------

Implementar memória de longo prazo simples, alinhada à persona.

Requisitos:
1) Criar arquivo `data/memory_facts.json`
2) Estrutura mínima:
   {
     "user_profile": {},
     "stream_profile": {},
     "custom_facts": []
   }
3) Regras de gravação:
   - Se usuário disser “lembra disso:” / “remember this:” / “覚えて:”
     → salvar em custom_facts
4) Não inventar fatos
5) Limitar quantidade (ex: máx 20)

Integração:
- Injetar os fatos no system prompt
  OU
- Injetar como mensagem system separada “[MEMORY FACTS]”

Antes de implementar:
- Mostre o plano e arquivos afetados
- Aguarde confirmação

--------------------------------------------------
PROMPT 4C — UI: MEMORY INSPECTOR
--------------------------------------------------

Adicionar seção “Memory” na UI Web com:

- Visualização de memory_facts.json
- Botão “Limpar memória”
- Botão “Exportar memória”
- Confirmação antes de apagar

Regras:
- Não expor segredos
- Somente leitura + ações explícitas

--------------------------------------------------
PROMPT 2B — UI: EDITOR SEGURO DE PERSONA (OVERRIDE)
--------------------------------------------------

Adicionar editor simples de persona na UI.

Requisitos:
1) NÃO editar o YAML base
2) Criar override em:
   data/persona_overrides/cohost_vtuber.override.yaml
3) Permitir editar apenas:
   - name
   - description
   - idioma preferido
   - nível de verbosity
4) Aplicar override ao gerar system prompt
5) Botões:
   - Salvar
   - Reverter override

Regras:
- Validar entrada
- Evitar injeção de prompt bruto

--------------------------------------------------
PROMPT FINAL — CHECKLIST DE DEMO
--------------------------------------------------

Criar um checklist de demo em 5 minutos:

1) Abrir UI Web
2) Ver persona ativa
3) Enviar mensagem em português
4) Responder em inglês
5) Responder em japonês
6) Pedir para “lembrar algo”
7) Ver memória na UI

Somente documentação.
Não alterar código.

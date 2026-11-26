# VHDL Sim: Arquitetura e Padrões de Código

Versão 1.0 · novembro de 2026

Este documento descreve como o VHDL Sim está organizado, por que está organizado assim e quais regras seguir ao mexer no código. Ele é a referência para manutenção: antes de criar um arquivo, mover uma função ou adicionar uma funcionalidade, confira aqui onde ela deve ficar.

O texto-fonte é `docs/arquitetura.md`. O PDF é gerado com `npm run docs`. Ao mudar a arquitetura, atualize o texto e gere o PDF de novo, no mesmo commit.

---

## 1. Visão geral

O VHDL Sim é um aplicativo de desktop para macOS que substitui o ModelSim nas disciplinas de sistemas digitais: edita VHDL, compila, simula e mostra as formas de onda.

| Peça | Tecnologia | Papel |
|---|---|---|
| Aplicativo | Electron | janela nativa, menus, diálogos, acesso a arquivos e processos |
| Interface | React + TypeScript | tudo o que o usuário vê |
| Editor | Monaco (o editor do VS Code) | edição de VHDL com destaque de sintaxe |
| Simulador | GHDL (programa externo) | compila e simula o VHDL, gera o arquivo de ondas `.vcd` |
| Ondas | Canvas 2D próprio | desenho das formas de onda |
| Testes | Vitest | testes unitários, de integração e de arquitetura |

O GHDL não faz parte do código: é um programa instalado no Mac que o app executa como processo filho, como o ModelSim executa o `vcom` e o `vsim`.

---

## 2. Camadas

O Electron divide o app em processos isolados. O código é organizado em quatro camadas, uma por pasta em `src/`:

<figure>
<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif" font-size="13">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#444"/></marker></defs>
  <rect x="10" y="20" width="200" height="150" rx="8" fill="#e8f0fe" stroke="#4a7bd0"/>
  <text x="110" y="45" text-anchor="middle" font-weight="bold">renderer</text>
  <text x="110" y="65" text-anchor="middle" fill="#555">interface (React)</text>
  <text x="110" y="95" text-anchor="middle" font-size="12">app/ · features/</text>
  <text x="110" y="113" text-anchor="middle" font-size="12">services/api.ts</text>
  <text x="110" y="150" text-anchor="middle" font-size="11" fill="#777">sem acesso a arquivos</text>
  <rect x="260" y="55" width="150" height="80" rx="8" fill="#fff4e0" stroke="#d09a2a"/>
  <text x="335" y="85" text-anchor="middle" font-weight="bold">preload</text>
  <text x="335" y="105" text-anchor="middle" fill="#555">ponte: window.api</text>
  <rect x="460" y="20" width="200" height="150" rx="8" fill="#e6f5e9" stroke="#3a9a52"/>
  <text x="560" y="45" text-anchor="middle" font-weight="bold">main</text>
  <text x="560" y="65" text-anchor="middle" fill="#555">processo principal (Node)</text>
  <text x="560" y="95" text-anchor="middle" font-size="12">app/ · ipc/</text>
  <text x="560" y="113" text-anchor="middle" font-size="12">project/ · ghdl/</text>
  <text x="560" y="150" text-anchor="middle" font-size="11" fill="#777">arquivos, diálogos, processos</text>
  <line x1="210" y1="95" x2="258" y2="95" stroke="#444" marker-end="url(#a)" marker-start="url(#a)"/>
  <line x1="410" y1="95" x2="458" y2="95" stroke="#444" marker-end="url(#a)" marker-start="url(#a)"/>
  <text x="434" y="85" text-anchor="middle" font-size="11" fill="#555">IPC</text>
  <rect x="680" y="70" width="36" height="50" rx="6" fill="#eee" stroke="#888"/>
  <text x="698" y="100" text-anchor="middle" font-size="11">GHDL</text>
  <line x1="660" y1="95" x2="678" y2="95" stroke="#444" marker-end="url(#a)"/>
  <rect x="160" y="215" width="400" height="70" rx="8" fill="#f3e8fd" stroke="#8a4ad0"/>
  <text x="360" y="242" text-anchor="middle" font-weight="bold">shared</text>
  <text x="360" y="262" text-anchor="middle" fill="#555">tipos do domínio, contrato, VHDL, ondas, force (código puro)</text>
  <line x1="110" y1="170" x2="230" y2="213" stroke="#8a4ad0" stroke-dasharray="4 3" marker-end="url(#a)"/>
  <line x1="335" y1="135" x2="345" y2="213" stroke="#8a4ad0" stroke-dasharray="4 3" marker-end="url(#a)"/>
  <line x1="560" y1="170" x2="490" y2="213" stroke="#8a4ad0" stroke-dasharray="4 3" marker-end="url(#a)"/>
</svg>
<figcaption>Figura 1. Camadas. Setas cheias: comunicação em tempo de execução. Tracejadas: dependência de código (todas apontam para shared).</figcaption>
</figure>

| Camada | Pasta | Roda em | Responsabilidade |
|---|---|---|---|
| **shared** | `src/shared/` | qualquer lugar | Tipos do domínio, contrato de comunicação e lógica pura (VHDL, VCD, tempo, force). Não acessa nada externo. |
| **main** | `src/main/` | processo principal (Node.js) | Janela, menus, diálogos nativos, arquivos, configurações e execução do GHDL. |
| **preload** | `src/preload/` | ponte isolada | Expõe o contrato como `window.api`, e mais nada. |
| **renderer** | `src/renderer/` | página web da janela | A interface: projeto, editor, Transcript, simulação e ondas. |

### 2.1 Regras de dependência

| Camada | Pode importar | Não pode importar |
|---|---|---|
| shared | só outros arquivos de shared | `electron`, `node:*`, `react`, main, renderer, preload |
| main | shared, `electron`, `node:*` | renderer, preload, React, Monaco |
| preload | `electron`, `@shared/contract` | qualquer outra coisa |
| renderer | shared, React, Monaco | `electron`, `node:*`, main, preload |
| renderer/features | shared, outras features, services | `renderer/src/app/` |

Regras extras:

- Só `renderer/src/services/api.ts` usa `window.api`. O resto da interface importa `api` desse arquivo.
- Só `main/ipc/handlers.ts` registra canais IPC (`ipcMain.handle`).
- Sempre importe shared pelo apelido `@shared/...`, nunca por caminho relativo como `../../shared`.

Essas regras são verificadas automaticamente por `tests/architecture.test.ts`. Se esse teste falhar, o código está na camada errada: mova o código, não afrouxe a regra.

**Por que assim?** A interface não tem acesso direto a arquivos nem a processos, o que é o modelo de segurança do Electron. A lógica pura fica em `shared`, onde é fácil de testar e de reutilizar dos dois lados. E cada camada pode mudar por dentro sem afetar as outras, desde que o contrato continue igual.

---

## 3. Estrutura de pastas

```
src/
  shared/                      código puro, usado por todas as camadas
    contract.ts                contrato IPC: interface Api, Handlers, eventos
    project.ts                 domínio: ProjectFile, EntityInfo, Diagnostic, Std
    vhdl/scan.ts               leitura leve de VHDL: entidades, portas, instâncias
    vhdl/classify.ts           design × testbench × package; escolha do Top
    waveform/vcd.ts            leitor de arquivos VCD
    waveform/radix.ts          formatação de valores (bin, hex, unsigned, signed)
    waveform/time.ts           tempo em femtossegundos: formatTime, parseTime
    simulation/force.ts        comando force: leitura, lista de forces, nomes do wrapper

  main/                        processo principal
    index.ts                   ponto de entrada: só liga as peças
    app/window.ts              janela; envio de eventos (log, menu) para a interface
    app/menu.ts                menu nativo (cada item só envia uma MenuAction)
    app/settings.ts            preferências (último projeto aberto)
    app/smoke.ts               teste automático de ponta a ponta (desenvolvimento)
    ipc/handlers.ts            um handler por método do contrato
    ipc/dialogs.ts             diálogos e menus nativos
    project/files.ts           listar e classificar os arquivos do projeto
    project/fileOps.ts         criar, renomear, duplicar, copiar arquivos
    project/templates.ts       modelos de VHDL (novo projeto, novo arquivo)
    ghdl/toolchain.ts          localizar o GHDL, ambiente, opções comuns
    ghdl/process.ts            executar processos; Break
    ghdl/diagnostics.ts        mensagens do GHDL → Diagnostic
    ghdl/compile.ts            vcom: compilar todos os arquivos em ordem
    ghdl/simulate.ts           vsim + run: elaborar, simular, gerar VCD
    ghdl/forceWrapper.ts       gera o testbench que aplica os forces

  preload/index.ts             window.api = contrato via ipcRenderer

  renderer/src/
    main.tsx                   ponto de entrada da interface
    services/api.ts            único acesso a window.api
    app/                       casca da janela
      App.tsx                  compõe as features e executa comandos
      Toolbar.tsx, StatusBar.tsx, PromptDialog.tsx, useSplitters.ts
      styles.css               estilos globais
    features/                  uma pasta por funcionalidade
      project/                 painel do projeto + useProject
      editor/                  abas e editor Monaco + useEditorTabs
      transcript/              console + comandos (commands.ts) + help
      simulation/              compilar/simular + sessão + regras
      waveform/                janela de ondas (componentes, desenho, modelo)

tests/
  architecture.test.ts         regras de dependência
  shared/                      testes de src/shared
  main/                        testes de src/main (incluem integração com GHDL)
  renderer/                    testes da lógica pura da interface
```

### 3.1 Dentro de uma feature

Cada pasta de `features/` separa três tipos de arquivo:

| Tipo | Nome | Contém | Exemplo |
|---|---|---|---|
| Componente | `NomeEmPascal.tsx` | só desenho e eventos da tela | `Waveform.tsx`, `SignalList.tsx` |
| Hook | `useAlgo.ts` | estado React e chamadas à `api` | `useSimulation.ts`, `useSession.ts` |
| Lógica pura | `substantivo.ts` | funções sem React e sem `api`, testáveis | `waveItems.ts`, `commands.ts`, `checks.ts` |

Regra prática: se uma função não precisa de estado nem de efeitos, ela vai para um arquivo de lógica pura e ganha teste.

---

## 4. Comunicação entre interface e main

Toda a comunicação passa pelo contrato `shared/contract.ts`:

1. A interface `Api` lista os métodos. Cada método de pedido e resposta é um canal IPC com o mesmo nome.
2. O preload cria `window.api` a partir da lista `INVOKE_METHODS`: cada método vira um `ipcRenderer.invoke(nome, ...)`.
3. O main implementa o tipo `Handlers` em `ipc/handlers.ts`. Se faltar um handler ou um tipo não bater, o TypeScript acusa erro na compilação.
4. Eventos do main para a interface (linhas do Transcript, cliques no menu) usam os canais de `EVENTS` e chegam por `api.onLog` / `api.onMenu`.

<figure>
<svg viewBox="0 0 720 150" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif" font-size="12">
  <defs><marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#444"/></marker></defs>
  <rect x="5" y="40" width="150" height="50" rx="6" fill="#e8f0fe" stroke="#4a7bd0"/><text x="80" y="62" text-anchor="middle">hook / componente</text><text x="80" y="78" text-anchor="middle" fill="#555">api.compile(...)</text>
  <rect x="190" y="40" width="130" height="50" rx="6" fill="#e8f0fe" stroke="#4a7bd0"/><text x="255" y="62" text-anchor="middle">services/api.ts</text><text x="255" y="78" text-anchor="middle" fill="#555">window.api</text>
  <rect x="355" y="40" width="130" height="50" rx="6" fill="#fff4e0" stroke="#d09a2a"/><text x="420" y="62" text-anchor="middle">preload</text><text x="420" y="78" text-anchor="middle" fill="#555">invoke('compile')</text>
  <rect x="520" y="40" width="190" height="50" rx="6" fill="#e6f5e9" stroke="#3a9a52"/><text x="615" y="62" text-anchor="middle">ipc/handlers.ts → serviço</text><text x="615" y="78" text-anchor="middle" fill="#555">compileFiles(...)</text>
  <line x1="155" y1="65" x2="188" y2="65" stroke="#444" marker-end="url(#b)"/>
  <line x1="320" y1="65" x2="353" y2="65" stroke="#444" marker-end="url(#b)"/>
  <line x1="485" y1="65" x2="518" y2="65" stroke="#444" marker-end="url(#b)"/>
  <path d="M615,90 C615,130 80,130 80,92" fill="none" stroke="#3a9a52" stroke-dasharray="4 3" marker-end="url(#b)"/>
  <text x="350" y="140" text-anchor="middle" fill="#3a9a52">resultado (Promise) e eventos log/menu</text>
</svg>
<figcaption>Figura 2. Caminho de uma chamada, da interface até o serviço no main.</figcaption>
</figure>

Os handlers são finos: leem os argumentos, chamam um diálogo (`ipc/dialogs.ts`) ou um serviço (`project/`, `ghdl/`) e devolvem o resultado. Regra de negócio não fica no handler.

---

## 5. Fluxos principais

### 5.1 Compilar (vcom)

1. **Compile All** ou `vcom` → `useSimulation.compile()`.
2. As abas não salvas são gravadas (`useEditorTabs.save`) e a lista de arquivos é relida.
3. `api.compile(dir, arquivos, std)` → `ghdl/compile.ts`:
   - apaga e recria `<projeto>/.vhdlsim/work-<std>/`;
   - ordena os arquivos (packages → design → testbenches);
   - executa `ghdl -a` em cada arquivo. Os que falham por falta de dependência são tentados de novo até não haver mais progresso, então o usuário nunca precisa ordenar arquivos;
   - transforma as mensagens em `Diagnostic` e escreve no Transcript.
4. A interface marca ✓ ✗ ! em cada arquivo e abre o primeiro erro no editor.

### 5.2 Simular (vsim + run)

<figure>
<svg viewBox="0 0 720 270" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif" font-size="12">
  <defs><marker id="c" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#444"/></marker></defs>
  <g text-anchor="middle" font-weight="bold"><text x="90" y="20">useSimulation</text><text x="300" y="20">ipc/handlers</text><text x="480" y="20">ghdl/simulate</text><text x="650" y="20">GHDL</text></g>
  <g stroke="#bbb" stroke-dasharray="3 3"><line x1="90" y1="28" x2="90" y2="265"/><line x1="300" y1="28" x2="300" y2="265"/><line x1="480" y1="28" x2="480" y2="265"/><line x1="650" y1="28" x2="650" y2="265"/></g>
  <g stroke="#444" marker-end="url(#c)">
    <line x1="90" y1="55" x2="298" y2="55"/><line x1="300" y1="95" x2="478" y2="95"/><line x1="480" y1="125" x2="648" y2="125"/><line x1="480" y1="160" x2="648" y2="160"/>
  </g>
  <g stroke="#3a9a52" stroke-dasharray="4 3" marker-end="url(#c)"><line x1="480" y1="205" x2="92" y2="205"/></g>
  <text x="195" y="48" text-anchor="middle">api.simulate(top, tempo, forces)</text>
  <text x="390" y="78" text-anchor="middle">forces? gera o wrapper</text>
  <text x="390" y="90" text-anchor="middle">(forceWrapper.ts)</text>
  <text x="565" y="118" text-anchor="middle">ghdl -e (elaborar)</text>
  <text x="565" y="153" text-anchor="middle">executável --vcd --stop-time</text>
  <text x="285" y="198" text-anchor="middle">{ ok, vcdPath, forced }</text>
  <text x="90" y="235" text-anchor="middle">lê o VCD (parseVcd)</text>
  <text x="90" y="252" text-anchor="middle">→ onda + "Now"</text>
</svg>
<figcaption>Figura 3. Sequência de um run.</figcaption>
</figure>

Decisões importantes:

- **O `run` re-simula do zero** até o tempo total (Now + duração). O GHDL não continua uma simulação parada, e simular de novo é rápido e determinístico para testbenches de aula.
- **Limites de segurança:** `run -all` para após 60 s, e qualquer simulação para quando o VCD passa de 200 MB (`ghdl/simulate.ts`). Isso evita travar a interface com um clock que nunca para.
- **Mensagens antes do run** (entradas sem driver, `run -all` com clock em `-repeat`) ficam em `features/simulation/checks.ts`.

### 5.3 Force

O GHDL não tem `force`. O app gera, a cada run, um testbench (`vhdlsim_force`) que instancia o Top como `dut` e dirige cada entrada forçada com um processo (`main/ghdl/forceWrapper.ts`). Ao carregar o VCD, `unwrapForcedVcd` (shared) renomeia `/vhdlsim_force/dut/x` para `/top/x`, e o usuário vê os nomes como no ModelSim. Os forces guardam o tempo em que foram dados (`start`), então valem a partir de "Now", como no ModelSim.

### 5.4 Sessão

A lista de sinais da onda (com base numérica e bits expandidos) e os forces são salvos em `<projeto>/.vhdlsim/session-<top>.json` (`features/simulation/session.ts` e `useSession.ts`). Eles são carregados quando o projeto ou o Top muda e salvos 400 ms depois de cada mudança. Se o formato mudar, aumente `SESSION_VERSION`.

---

## 6. Estado da interface

Cada parte do estado tem um único dono:

| Estado | Dono | Observação |
|---|---|---|
| linhas do Transcript | `useTranscript` | também recebe as linhas do GHDL |
| pasta, arquivos, Top | `useProject` | `entities` vêm na ordem do seletor |
| abas, aba ativa, salvamento | `useEditorTabs` | `WAVE_TAB` é a aba de ondas |
| sinais da onda, forces | `useSession` | persistidos por projeto e Top |
| compilação, tempo, VCD, ocupado | `useSimulation` | recebe as outras partes como dependências |
| zoom, cursores, seleção | `Waveform.tsx` | estado só de visualização |
| larguras das colunas | `useColumnWidths` | lembradas no `localStorage` |

O `App.tsx` só compõe esses hooks, liga um ao outro onde for preciso (por exemplo, compilar salva as abas) e traduz comandos do Transcript em chamadas. Lógica nova não deve ir para o `App.tsx`: vá para a feature correspondente.

---

## 7. Padrões de código

### 7.1 Geral

- **Linguagem:** TypeScript estrito (`strict: true`). Evite `any`; use `unknown` e valide.
- **Idioma:** código, nomes e comentários em inglês; documentação para usuários em português.
- **Nomes:** arquivos de componente em `PascalCase.tsx`; hooks `useAlgo.ts`; demais arquivos em `camelCase.ts`. Funções começam com verbo (`parseVcd`, `buildRows`, `formatTime`).
- **Tamanho:** um arquivo, uma responsabilidade. Acima de ~300 linhas, procure algo para separar.
- **Comentários:** todo arquivo começa com um comentário de uma ou duas linhas dizendo o que ele faz. Comente o porquê, não o quê.
- **Funções puras primeiro:** regra de negócio em funções que recebem dados e devolvem dados. Estado React e chamadas à `api` ficam nos hooks.
- **Imutabilidade:** funções que alteram listas devolvem uma lista nova (ver `waveItems.ts`).

### 7.2 Domínio

- **Tempo:** sempre inteiro em **femtossegundos** (fs) no app. Dentro da janela de ondas, as unidades do VCD (`timescaleFs` converte). Use `formatTime` / `parseTime`.
- **Valores de sinal:** cadeias de bits, MSB primeiro, com metavalores VHDL (`U`, `X`, `Z`…). Formate com `formatValue`.
- **Nomes VHDL:** guardados em minúsculas (VHDL não diferencia maiúsculas).
- **Caminhos de sinal:** `/top/instância/sinal` (função `signalKey`).

### 7.3 Mensagens e erros

- As mensagens do Transcript seguem o ModelSim: `** Error: …`, `** Warning: …`, comandos ecoados com o prompt.
- Use o tipo de linha certo (`LogKind`): `cmd`, `info`, `ok`, `warn`, `err`, `out`.
- Serviços do main lançam `Error` com mensagem para o usuário; a interface mostra `errorMessage(e)` (de `services/api.ts`), que tira o prefixo do Electron.
- Operações de melhor esforço (salvar sessão, preferências) não derrubam o app: falhas são ignoradas de propósito, com comentário dizendo isso.

### 7.4 Interface

- Componentes recebem dados e callbacks por props; não chamam `api` diretamente (quem chama é o hook).
- Textos e atalhos da interface ficam em inglês, como no ModelSim, para quem usa os dois.
- Cores da janela de ondas ficam em `COLORS` (`waveform/draw.ts`); o resto, em `app/styles.css`.

---

## 8. Testes

```bash
npm test            # todos os testes
npm run typecheck   # tipos
```

| Pasta | O que testa | Observação |
|---|---|---|
| `tests/architecture.test.ts` | regras de dependência da seção 2.1 | falha com a lista de imports proibidos |
| `tests/shared/` | VCD, bases, tempo, VHDL, force | puros e rápidos |
| `tests/main/` | arquivos, modelos, GHDL, force | os testes com GHDL são pulados se ele não estiver instalado |
| `tests/renderer/` | comandos, onda, sessão, regras | só a lógica pura (sem React) |

Regras:

- Toda função de lógica pura nova ganha teste no espelho da pasta (`src/x/y.ts` → `tests/x/y.test.ts` ou o arquivo do mesmo assunto).
- Bug corrigido ganha um teste que falhava antes da correção.
- Para mudanças visuais, rode o app (`npm run dev`) ou o teste de ponta a ponta (`app/smoke.ts`, variáveis `VHDLSIM_SMOKE*` documentadas no arquivo).

---

## 9. Receitas

### 9.1 Novo comando no Transcript

1. `features/transcript/commands.ts`: adicione a variante em `Command` e o `case` em `parseCommand`.
2. `app/App.tsx`, função `execute`: chame a ação da feature responsável.
3. `features/transcript/help.ts` e o README: documente.
4. `tests/renderer/commands.test.ts`: teste a leitura do comando.

### 9.2 Novo método entre interface e main

1. `shared/contract.ts`: adicione o método em `Api` e em `METHODS`.
2. `main/ipc/handlers.ts`: implemente (o TypeScript exige). A lógica vai para um serviço em `main/project/` ou `main/ghdl/`.
3. Use na interface com `api.novoMetodo(...)` dentro de um hook.
4. O preload não muda: ele lê `INVOKE_METHODS`.

### 9.3 Novo item no menu nativo

1. `shared/contract.ts`: adicione o nome em `MenuAction`.
2. `main/app/menu.ts`: crie o item com `sendMenu('nome')`.
3. `app/App.tsx`: adicione o handler em `handlers.current`.

### 9.4 Novo recurso na janela de ondas

- Cálculo (tempo, linhas, padrões) → `timeAxis.ts` ou `waveItems.ts`, com teste.
- Desenho → `draw.ts` (recebe tudo pelo `WaveScene`).
- Tela → `Waveform.tsx` ou um componente novo na pasta.
- Se precisar ser salvo entre execuções → campo novo em `WaveItem` (vai para a sessão automaticamente).

### 9.5 Nova feature

Crie `features/<nome>/` com componente(s), um hook `use<Nome>.ts` para o estado e arquivos de lógica pura. Ligue-a no `App.tsx`. Não importe nada de `app/` dentro da feature.

---

## 10. Build, versão e commits

```bash
npm run dev     # desenvolvimento, com recarga
npm run build   # compila main, preload e renderer em out/
npm run dist    # gera o instalador .dmg/.zip em dist/
npm run docs    # gera docs/arquitetura.pdf a partir deste arquivo
```

- **Versão:** `version` no `package.json`, no formato semver (`0.2.0`). Publique com uma tag `vX.Y.Z` e uma release no GitHub contendo o `.dmg` e o `.zip` (passo a passo no README).
- **Commits:** mensagem em português, no imperativo, com uma linha de resumo (ex.: "Adiciona comando examine") e, se preciso, um parágrafo explicando o porquê. Um commit por mudança coerente; testes e documentação junto com o código.
- **Antes de commitar:** `npm run typecheck` e `npm test` passando.

---

## 11. Glossário

| Termo | Significado |
|---|---|
| **Top** | entidade simulada como raiz (normalmente o testbench) |
| **Testbench** | entidade sem entradas que gera estímulos para o design |
| **Elaboração** | etapa do GHDL que monta o executável da simulação a partir do Top |
| **VCD** | *Value Change Dump*: arquivo de texto com as mudanças de cada sinal no tempo |
| **Force** | comando que impõe valores a uma entrada do Top, como no ModelSim |
| **Wrapper** | testbench gerado pelo app para aplicar os forces (`vhdlsim_force`) |
| **IPC** | comunicação entre os processos do Electron (interface ↔ main) |
| **fs** | femtossegundo (10⁻¹⁵ s), unidade interna de tempo do app |
| **Radix** | base numérica de exibição (binário, hex, unsigned, signed) |

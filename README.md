# VHDL Sim: alternativa ao ModelSim para macOS (Apple Silicon)

Editor, compilador e visualizador de formas de onda para **VHDL**, no estilo do ModelSim-Altera 18.1, rodando nativamente em Macs com chip **M1/M2/M3/M4**.
Feito para as disciplinas de sistemas digitais: escrever o VHDL, compilar, simular o testbench e analisar as ondas, sem precisar de Windows nem de máquina virtual.

Por baixo, a simulação é feita pelo [GHDL](https://github.com/ghdl/ghdl), um simulador VHDL livre e confiável. A interface é própria (Electron + React + editor Monaco + visualizador de ondas próprio).

---

## Instalação (para quem só quer usar)

### 1. Baixar o aplicativo

1. Abra a página **[Releases](https://github.com/samuel-mendes-monteiro/ModelSim-for-MacOs-v2/releases)** do repositório.
2. Baixe o arquivo **`VHDL-Sim-<versão>-arm64.dmg`**.
3. Abra o `.dmg` e arraste o **VHDL Sim** para a pasta **Aplicativos**.

> Só funciona em Macs com Apple Silicon (M1 ou mais novo). Macs com Intel não são suportados.

### 2. Liberar a primeira abertura

O app não é assinado pela Apple. Por isso, na primeira vez o macOS bloqueia com a mensagem *"Apple não pôde verificar…"*. Para liberar:

1. Tente abrir o **VHDL Sim** uma vez e clique em **OK** (ou **Concluído**).
2. Vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o fim e clique em **Abrir Mesmo Assim** ao lado de "VHDL Sim".
3. Confirme com a sua senha. Das próximas vezes ele abre normalmente.

Alternativa pelo Terminal (faz a mesma coisa):

```bash
xattr -dr com.apple.quarantine "/Applications/VHDL Sim.app"
```

### 3. Instalar o GHDL (o simulador)

O app precisa do GHDL para compilar e simular. O cask do Homebrew foi desativado, então use o build oficial. Copie e cole no Terminal:

```bash
curl -L -o /tmp/ghdl.tgz https://github.com/ghdl/ghdl/releases/download/v6.0.0/ghdl-llvm-6.0.0-macos15-aarch64.tar.gz
mkdir -p ~/.local/ghdl && tar -xzf /tmp/ghdl.tgz -C ~/.local/ghdl --strip-components=1
xattr -dr com.apple.quarantine ~/.local/ghdl
```

O GHDL também usa o linker da Apple. Se você nunca instalou as ferramentas de linha de comando do Xcode, rode:

```bash
xcode-select --install
```

O app procura o `ghdl` em `~/.local/ghdl/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, no `PATH` ou na variável de ambiente `GHDL`. A barra inferior do app mostra a versão do GHDL encontrada. Se ele não for encontrado, o Transcript mostra como instalar.

---

## Passo a passo: primeiro projeto

1. **File → New Project…** (⇧⌘N): escolha uma pasta. O app cria um design e um testbench de exemplo, prontos para simular.
   Se você já tem os arquivos `.vhd`, use **Open Folder** (⌘O) e escolha a pasta deles.
2. Edite os arquivos no editor. **⌘S** salva.
3. Clique em **Compile All** (⌘B). Os erros aparecem no **Transcript**: clique na linha do erro para ir direto a ela no código.
4. No seletor **Top**, escolha o testbench. O app já sugere sozinho a entidade de topo, marcada com "(top)".
5. Digite o tempo (ex.: `1 us`) e clique em **Run** (F9), ou **Run -All** (⇧F9) se o testbench termina sozinho.
6. Analise as ondas: clique para posicionar o cursor C1, ⇧+clique para o C2, e o Δ entre eles aparece no topo.

---

## O que o app tem

| Recurso | Como usar |
|---|---|
| **Projeto** | **Open Folder** (⌘O) abre qualquer pasta com `.vhd`/`.vhdl` (busca também nas subpastas). Os arquivos aparecem separados em *Design*, *Testbenches* e *Packages* |
| **Novo projeto** | File → **New Project…** (⇧⌘N) |
| **Adicionar arquivo** | **Open File** (⌥⌘O) adiciona arquivos ao projeto aberto (arquivos de outras pastas são copiados para dentro dele) |
| **Novo arquivo** | **New** (⌘N) |
| **Gerenciar arquivos** | botão direito no arquivo: Open, Set as Top, Rename…, Duplicate, Reveal in Finder, Copy Path, Move to Trash |
| **Editor** | destaque de sintaxe VHDL, números de linha, autocompletar e trechos prontos (`entity`, `process`…), erros sublinhados |
| **Compilação** | **Compile All** (⌘B): a ordem dos arquivos é resolvida automaticamente. Erros e avisos aparecem no Transcript com arquivo e linha clicáveis |
| **Padrão VHDL** | VHDL-2008 (padrão) ou VHDL-93 no seletor da barra |
| **Detecção do Top** | entidade sem entradas que ninguém instancia, ou nome `*_tb` / `tb_*`. Se você escolher um bloco com entradas soltas, o app avisa |
| **Simulação** | **Run** (F9) avança o tempo; **Run -All** (⇧F9) roda até o testbench parar; **Break** (⌘.) interrompe; **Restart** (⌘R) volta para 0 |
| **Force (como no ModelSim)** | botão direito no sinal → **Force…** / **NoForce**, ou `force` no Transcript. Permite simular um bloco **sem testbench** |
| **Formas de onda** | entradas, saídas e sinais internos; zoom (⌘+scroll, pinça, `I`/`O`, **Fit** = `F`); cursores C1/C2 com Δ e frequência; ←/→ pulam para a próxima borda |
| **Base numérica** | botão direito no sinal → Binary / Hex / Unsigned / Signed (padrão: binário até 8 bits, hex acima) |
| **Expandir vetor** | botão **+** ao lado do vetor mostra cada bit: `a(1)`, `a(0)` |
| **Sinais internos** | painel **Objects**: clique numa instância (ex.: `uut`) e dê duplo clique no sinal, ou **Add all** |
| **Organizar a onda** | arraste os sinais para reordenar; **Delete** remove; arraste a divisória para mudar a largura da lista de sinais (duplo clique volta ao padrão) |
| **Configuração salva** | sinais da onda, bases e forces ficam salvos por projeto e por Top e voltam quando você reabre |
| **Abrir `.vcd`** | **Open VCD** (⇧⌘O) abre um arquivo de ondas gerado por outra ferramenta |

### Comandos do Transcript

| Comando | O que faz |
|---|---|
| `vcom` | compila todos os arquivos |
| `vsim <entidade>` | escolhe o Top |
| `run 100 ns` / `run 1 us` / `run 5 sec` | avança a simulação |
| `run -all` | roda até o testbench parar (limite de 60 s) |
| `restart` | volta para 0 ns (mantém a onda e os forces) |
| `break` | interrompe a simulação |
| `add wave *`, `add wave /tb/uut/*` | adiciona sinais à onda |
| `delete wave *` | limpa a onda |
| `radix bin` / `hex` / `unsigned` / `signed` | muda a base de todos os sinais |
| `force <sinal> <valor> ...` | força uma entrada do Top (veja abaixo) |
| `force` | lista os forces ativos |
| `noforce <sinal>` / `noforce *` | remove forces |
| `std 08` / `std 93c` | padrão VHDL |
| `clear`, `help` | limpa o Transcript / mostra a ajuda |

### Exemplo de `force`: simular um contador sem testbench

```
force clock 0 0, 1 50 -repeat 100
force reset 1
force enable 0
force load 0
force dload 16#7
run 250 ns
force reset 0
run 1 us
```

- Tempos sem unidade são em **ns** e contam a partir do tempo atual ("Now"), como no ModelSim. `{50 ns}` também é aceito.
- Valores: `0`, `1`, `Z`… para bits; vetores em binário (`0101`), com base (`16#A`, `10#9`) ou `x"A"`.
- Sinais forçados aparecem com a marca **F** na onda.

---

## O que o app **não** tem (diferenças para o ModelSim)

- **Verilog / SystemVerilog**: só VHDL. Também não há projetos misturando as duas linguagens.
- **Force em sinais internos**: só as **entradas do Top** podem ser forçadas. `-cancel` e `-deposit` não são suportados.
- **Breakpoints e execução passo a passo** no código.
- **Scripts `.do` / Tcl** e o comando `wave.do` (a configuração da onda é salva automaticamente, mas em formato próprio).
- **Janelas Dataflow, List, Memory, Schematic** e análise de cobertura de código.
- **Divisores, grupos e busca por valor** na janela de ondas; exibição analógica.
- **Constantes na onda** (ex.: `T = 10 ns`): só sinais aparecem.
- **Arquivos `.ghw`**: só `.vcd`.
- **Macs Intel e Windows/Linux**: o instalador é só para Apple Silicon (o código-fonte roda em outras plataformas, mas não é testado).

Diferenças de comportamento:

- O `run` não continua de onde parou: ele **re-simula do zero** até o novo tempo total. O resultado é idêntico, só fica mais lento em simulações muito longas.
- `run -all` com um clock que nunca para (`clk <= not clk after 5 ns;`) só termina no limite de segurança (60 s ou 200 MB de ondas), igual ao ModelSim, que roda até você clicar em Break. Para o testbench parar sozinho, use `std.env.stop;` (VHDL-2008) no fim do processo de estímulo, ou use `run <tempo>`.
- O GHDL às vezes é mais rígido que o ModelSim e recusa códigos que o ModelSim aceita "por boa vontade". As mensagens de erro mostram a linha exata.

---

## Para desenvolvedores

Requisitos: Node.js 20+, GHDL (veja acima) e Xcode Command Line Tools.

```bash
npm install
npm run dev        # abre o app em modo desenvolvimento
npm test           # testes (parser VCD, bases numéricas, force, integração com o GHDL)
npm run typecheck  # checagem de tipos
```

### Gerar o instalador (.dmg)

```bash
npm run dist
```

Gera em `dist/`:
- `VHDL-Sim-<versão>-arm64.dmg`: instalador (arrastar para Aplicativos)
- `VHDL-Sim-<versão>-arm64.zip`: o mesmo app compactado

O app é assinado *ad-hoc* (sem conta de desenvolvedor Apple), por isso aparece o aviso do macOS na primeira abertura (veja *Liberar a primeira abertura*).

### Publicar uma versão para download

1. Atualize `version` no `package.json` (ex.: `0.2.0`) e rode `npm run dist`.
2. Crie a release no GitHub com os arquivos gerados. Pela linha de comando ([GitHub CLI](https://cli.github.com)):
   ```bash
   gh release create v0.2.0 dist/VHDL-Sim-0.2.0-arm64.dmg dist/VHDL-Sim-0.2.0-arm64.zip --title "VHDL Sim 0.2.0" --notes "O que mudou nesta versão"
   ```
   Ou pelo site: **Releases → Draft a new release**, crie a tag, arraste o `.dmg` e o `.zip` e clique em **Publish release**.
3. O link de download fica na página **Releases** do repositório.

### Estrutura

```
src/main/       processo principal: arquivos, menus, GHDL (ghdl.ts), force (forceTb.ts)
src/preload/    ponte segura entre a interface e o processo principal
src/renderer/   interface React: projeto, editor, Transcript, visualizador de ondas
src/shared/     código comum: parser VCD, bases numéricas, comando force
tests/          testes (Vitest)
examples/       projeto de exemplo (contador + testbench)
```

Observações:
- Os arquivos de compilação ficam em `<projeto>/.vhdlsim/` e podem ser apagados a qualquer momento.
- A configuração salva da onda fica em `<projeto>/.vhdlsim/session-<top>.json`.

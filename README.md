# Compras — Apartamento GB

App simples e compartilhado para Ivan e Giovana tocarem o apartamento: decidir o que fica,
cotar o que ficou e acompanhar os contratos e pagamentos da obra. Sincroniza em tempo real
via Supabase Realtime.

- **Decisões** — item a item, o que fica, sai ou troca; dá para adicionar um item que não
  estava no projeto original (papel de parede, por exemplo) pelo botão "+ Novo item".
- **Cotações** — os itens marcados como `FICA`, com foto, preço, loja e link do produto.
- **Obra** — contratos de serviço (arquiteta, marcenaria, empreiteiro) e suas parcelas.
- **Orçamento** — de onde vem o dinheiro, quanto já saiu e se sobra ou estoura no fim.

Em `/relatorio` o app monta uma prestação de contas fechada, para imprimir ou salvar em PDF.

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres + Realtime), tabelas `public.shopping_items`, `public.obra_contratos`,
  `public.obra_parcelas` e `public.orcamento_entradas`
- Sem autenticação tradicional — cada morador entra com a própria senha (ver abaixo)

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon/publishable (segura para o navegador) |
| `IVAN_PASSWORD` | Senha do Ivan para entrar no app |
| `GIOVANA_PASSWORD` | Senha da Giovana para entrar no app |
| `SESSION_SECRET` | Segredo aleatório usado para assinar o cookie de sessão |
| `GEMINI_API_KEY` | Chave da Gemini API, usada só no servidor para a busca automática de preço |
| `GEMINI_QUOTE_MODEL` | Opcional — modelo Gemini para a busca (padrão `gemini-3.6-flash`) |

Nenhuma dessas variáveis deve conter a `service_role key` do Supabase.

## Cotação automática

Na etapa "Cotações", o botão "Buscar melhor preço" chama `app/api/quote/search/route.ts`, que
usa a Gemini API com busca do Google (grounding) para procurar o preço atual do item em lojas
brasileiras conhecidas e devolve preço, loja, link do produto e foto. É uma busca por IA, não
uma comparação estruturada de preços — pode falhar ou vir impreciso; por isso os campos
continuam editáveis manualmente, e o botão "Buscar novamente" permite tentar de novo. Sem
`GEMINI_API_KEY` configurada, o botão retorna erro e a cotação manual continua funcionando
normalmente.

## Acompanhamento de obra

A aba "Obra" controla contratos de serviço e o pagamento de cada parcela.

**A decisão que sustenta o resto: não existe campo "status" na parcela.** O banco guarda
fatos — `pago_em`, `vencimento`, `marco_entregue_em` — e `lib/obra.ts` deriva o estado na
hora de exibir (`statusParcela`). Um campo gravado com "atrasado" ficaria velho no dia
seguinte e dependeria de alguém lembrar de atualizar; assim a tela nunca mente.

Cada contrato é um bloco que abre e fecha: fechado mostra fornecedor, progresso e uma linha de
resumo ("2 de 8 pagas · próxima 10/10"); aberto mostra as parcelas. Contratos com parcela
atrasada abrem sozinhos, e um filtro ativo também força a abertura — esconder parcelas ali
anularia o próprio filtro. A escolha de cada card fica no `localStorage`.

Nas parcelas, só a ação daquela linha fica à vista ("Marcar pago" ou "Marco entregue"). Editar,
excluir e desfazer vivem atrás do `•••`: são raras e ocupavam mais altura que os próprios dados.

Parcela tem dois gatilhos possíveis:

| Gatilho | Quando vence |
| --- | --- |
| `data` | Na data fixa em `vencimento`, como no contrato |
| `marco` | Só depois que a entrega acontece: `marco_entregue_em + prazo_dias` |

Enquanto o marco não é marcado como entregue, a parcela fica "aguardando entrega" e **não
conta como atraso** — é o caso de "30% na entrega do projeto executivo", que não tem data
até a arquiteta entregar.

Fora de escopo por enquanto, porque cada um é mais um campo para manter atualizado: aditivo
de contrato, retenção técnica, reajuste por índice e rateio entre as duas pessoas.

## Orçamento

A aba "Orçamento" junta o dinheiro que estava espalhado em três lugares que não se falavam:
contratos de obra, itens de compra cotados e iluminação.

| Número | Fórmula | O que responde |
| --- | --- | --- |
| Orçamento | entradas recebidas + previstas | Quanto existe no total |
| Realizado | parcelas pagas + itens comprados | Quanto já saiu da conta |
| Saldo real | entradas recebidas − realizado | Quanto tem hoje, de verdade |
| Projetado | orçamento − (realizado + comprometido) | Sobra ou estoura no fim |

Duas regras sustentam a honestidade dessas contas:

**Cotado não é comprado.** `shopping_items.comprado_em` e `valor_pago` registram a compra
efetiva. Enquanto o item está só cotado ele conta como *comprometido*, nunca como *realizado*.
Quando o pago difere do cotado, o card mostra quanto se economizou ou estourou.

**O que não se sabe nunca vira zero.** Itens que ficam mas ainda não têm preço aparecem como
um aviso próprio ("12 itens ainda sem cotação") e ficam **fora de todas as somas**. Um
projetado que trata buraco como R$ 0 mente a favor de quem lê.

A entrada segue o mesmo desenho da parcela: só `recebido_em` é gravado; previsto e atrasado
são derivados em `lib/orcamento.ts`. Entrada prevista entra no orçamento total e na projeção,
mas fica de fora do saldo real — saldo só considera dinheiro que já existe na conta.

Iluminação entra nas contas como comprometido, mas ainda não tem tela no app, então não há
como marcá-la como comprada pela interface. A tabela mostra isso explicitamente.

## Relatório de prestação de contas

`/relatorio` monta um documento para entregar a quem está bancando a reforma: resumo dos
números, entradas lançadas, pagamentos realizados em ordem cronológica, o que está em aberto
mês a mês e as compras escolhidas agrupadas por ambiente.

O botão gera o PDF no próprio navegador (`lib/pdfRelatorio.ts`, com jsPDF e jspdf-autotable) e
entrega o arquivo à folha de compartilhamento do sistema via `navigator.share`, onde estão o
WhatsApp, o e-mail e a impressão. Onde a Web Share nível 2 não existir — desktop, em geral — o
mesmo botão baixa o arquivo e muda de rótulo para "Baixar PDF".

A versão anterior usava `window.print()`, que no Safari em tela cheia simplesmente não abre
nada, e mesmo funcionando exigia salvar o PDF e ir procurá-lo para compartilhar.

Três decisões valem nota:

- **As bibliotecas entram por `import()` dinâmico**, só quando alguém aperta o botão. A rota
  continua leve para quem só quer ler na tela.
- **`showFoot: "lastPage"` e `rowPageBreak: "avoid"` nas tabelas.** O padrão do autoTable
  repete o rodapé em toda página: "Total pago" apareceria embaixo de uma lista incompleta e
  pareceria erro de conta. E sem `rowPageBreak` a forma de pagamento ficava órfã na página
  seguinte.
- **A rota fica atrás do código de acesso.** Ao contrário de `/cotacao`, que é público de
  propósito para mandar a fornecedor, o relatório é dado financeiro da família e não entra em
  `PUBLIC_PATHS` no `middleware.ts`.

O `@media print` continua em `app/globals.css` para quem imprimir a página pelo navegador no
computador.

O documento declara o que não sabe: os itens que ficam mas ainda não têm cotação aparecem em
seção própria, fora de todos os totais. Prestação de contas que esconde buraco não presta
contas.

## Segurança

As policies de RLS liberam as operações para o papel `anon`, sem outra restrição — é o
desenho pedido para o app funcionar sem autenticação tradicional. As tabelas de obra e de
orçamento seguem o mesmo padrão das `shopping_items`, incluindo DELETE, porque o app precisa
excluir contratos, parcelas e entradas. Como isso
por si só deixaria a tabela editável por qualquer pessoa que descobrisse a URL do Supabase e a
chave anon (visível no bundle do navegador), o app adiciona uma trava simples e apropriada
para uso familiar: Ivan e Giovana entram com senhas próprias (`IVAN_PASSWORD` /
`GIOVANA_PASSWORD`), verificadas em `/api/login`. O acesso é liberado por um cookie
`httpOnly` (`gb_session`) checado pelo `middleware.ts` em toda rota; a senha usada também
define, num segundo cookie legível (`gb_user`), quem está logado — isso substitui a tela
antiga em que a pessoa só clicava no próprio nome, sem nenhuma prova de que era ela mesma.
`robots.txt` também bloqueia indexação.

Isso não é proteção de nível bancário — para dados sensíveis, o próximo passo seria Supabase
Auth com policies por usuário. Para uma lista de decisões de compra de eletrodomésticos, entre
duas pessoas, é proporcional.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local # preencha os valores
npm run dev
```

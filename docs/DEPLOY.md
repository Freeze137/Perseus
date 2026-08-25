# PERSEUSS — subir no ar (VM na Oracle Cloud)

Runbook. A ordem importa: cada passo depende do endereço que o anterior
produziu.

> **Há duas rotas.** Esta usa uma VM própria: mais controle, e a conta de
> manutenção que vem junto — Postgres, nginx, certbot, DNS, e a fila de
> capacidade do Ampere, que pode negar a instância por dias.
> A outra está em [`DEPLOY-FLY.md`](DEPLOY-FLY.md): container no Fly.io,
> Postgres no Neon, TLS pronto. Menos peças, menos manutenção, e nenhuma fila.
> As duas rodam o mesmo código sem alteração nenhuma.

Peças e onde ficam:

| Peça | Onde | Por quê |
| --- | --- | --- |
| `apps/web` | Vercel | Next 16, build estático + uma rota dinâmica. É o que a Vercel faz de graça e bem. |
| `apps/api` | VM Ampere A1 na Oracle Cloud | Precisa segurar conexões SSE abertas por minutos. Function serverless não serve para isso. |
| Postgres | A mesma VM, na loopback | Duas escritas por duelo. Não justifica um segundo servidor, e a loopback dispensa TLS e firewall. |

---

## 0. Antes de tudo

1. **Repositório no GitHub.** O git local já está iniciado e com o primeiro
   commit. Falta publicar:
   ```sh
   gh repo create perseus --private --source=. --push
   # sem o gh:  git remote add origin git@github.com:SEU-USUARIO/perseus.git
   #            git push -u origin main
   ```
   `.gitignore` bloqueia `.env` e `.env.*`; confirme com
   `git ls-files | grep -i env` — só os `.example` devem aparecer.

2. **Nome para a API.** O site na Vercel é HTTPS, e navegador em página HTTPS
   recusa chamar API em HTTP. O Let's Encrypt não emite certificado para IP
   puro. Decidido usar **DuckDNS**:
   - <https://www.duckdns.org> → entrar com GitHub → criar o subdomínio
     (ex. `perseus-api` → `perseus-api.duckdns.org`) → anotar o **token**.
   - Aponte para o IP público da VM depois do passo 1.
   - Trocar por domínio próprio mais tarde não mexe em código: só no
     `CORS_ORIGINS` da API e na variável da Vercel.

3. **IP público reservado.** No console, marque o IP da VM como *reserved*.
   Efêmero, ele muda a cada parada da instância e leva o DNS junto. Se preferir
   deixar efêmero, o passo 3 tem o atualizador automático.

4. **Node 22+** — está no `engines` do repositório, a imagem da VM não traz.
   O `setup-vm.sh` instala.

---

## 1. A VM

Console da Oracle → **Compute → Instances → Create instance**.

| Campo | Valor |
| --- | --- |
| Image | **Canonical Ubuntu 24.04** (trocar da Oracle Linux padrão) |
| Shape | **VM.Standard.A1.Flex** — 1 a 2 OCPU, 6 a 12 GB. Ver a nota sobre capacidade. |
| Rede | VCN e subnet **pública** já existentes (crie pelo *Start VCN Wizard*) |
| Chave SSH | Gere e **guarde a privada** — não há segunda chance |

**Crie a VCN antes, pelo wizard.** Networking → Virtual cloud networks →
*Start VCN Wizard* → *VCN with Internet Connectivity*. Criar a subnet dentro do
formulário da instância deixa o toggle de IP público travado em "You must select
a public subnet", e sem IP público não há SSH nem site.

### Quando o Ampere disser `Out of capacity`

É fila do free tier, não erro de configuração — e em regiões de uma única
*availability domain*, como Vinhedo, não há outro AD para tentar. Em ordem:

1. **Peça menos**: 1 OCPU / 6 GB cabe em fragmentos onde 2 OCPU não cabe.
2. **Insista**: capacidade libera em ondas; madrugada costuma ser melhor.
3. **`VM.Standard.E2.1.Micro`**: x86, 1 OCPU, 1 GB, também Always Free e sempre
   disponível. Roda a API e o Postgres sem drama — o `setup-vm.sh` cria 2 GB de
   swap e compila só os pacotes e a API, porque o site é compilado na Vercel.
   Migrar para A1 depois é recriar a VM e rodar o mesmo script.
4. **Pay As You Go**: contas pagas têm prioridade na fila do Ampere e os
   recursos Always Free continuam gratuitos. Destrava de verdade; o risco é
   criar sem querer algo fora do teto gratuito.

### Abrir as portas — nos dois lugares

Esta é a pegadinha clássica, e ela tem duas metades. Fazer só uma dá exatamente
o mesmo sintoma de não fazer nenhuma.

**Metade 1, no console:** Networking → VCN → Security Lists → *Default* → Add
Ingress Rules: `0.0.0.0/0`, TCP, portas 80 e 443.

**Metade 2, na máquina:** a imagem Ubuntu da Oracle vem com um `REJECT` no fim
da cadeia INPUT. O `setup-vm.sh` cuida disso.

---

## 2. A máquina

```sh
ssh -i sua-chave.key ubuntu@IP-DA-VM

sudo mkdir -p /opt/perseus && sudo chown ubuntu:ubuntu /opt/perseus
git clone https://github.com/SEU-USUARIO/perseus.git /opt/perseus
cd /opt/perseus
bash deploy/setup-vm.sh
```

O script instala Node, nginx, Postgres e certbot; abre 80/443 no iptables; cria
o banco `perseus` com uma senha aleatória; roda `0004_matches.sql`; escreve
`/etc/perseus/api.env` com `0600`; e compila o repositório.

Ele **não** sobe o serviço, porque falta o `CORS_ORIGINS`, que só existe depois
que a Vercel dá um domínio ao site. Ordem correta: passo 4, depois volte aqui.

> As migrações `0001`–`0003` não rodam nesta máquina: elas referenciam o schema
> `auth` do Supabase. O ranking individual continua no Supabase (ou desligado);
> o duelo é autossuficiente. Está explicado em `docs/DUELO.md §4`.

---

## 3. DNS e TLS

**Apontar o DuckDNS para a VM** — do seu computador ou da própria VM:

```sh
curl "https://www.duckdns.org/update?domains=perseus-api&token=SEU-TOKEN&ip=IP-DA-VM"
# resposta esperada: OK
dig +short perseus-api.duckdns.org      # tem que devolver o IP da VM
```

Se o IP da VM for efêmero, deixe um atualizador no cron da máquina — cinco
minutos de intervalo, sem `ip=` para ele usar o endereço de origem:

```sh
( crontab -l 2>/dev/null; echo '*/5 * * * * curl -fsS "https://www.duckdns.org/update?domains=perseus-api&token=SEU-TOKEN&ip=" >/dev/null' ) | crontab -
```

**nginx e certificado**, só depois que o `dig` acima responder certo:

```sh
sudo cp deploy/nginx-perseus-api.conf /etc/nginx/sites-available/perseus-api
sudo sed -i 's/SEU-DOMINIO/perseus-api.duckdns.org/' /etc/nginx/sites-available/perseus-api
sudo ln -sf /etc/nginx/sites-available/perseus-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d perseus-api.duckdns.org
```

O certbot valida por HTTP na porta 80 — se ela não estiver aberta nas **duas**
metades do passo 1, ele falha aqui, e essa é a hora em que o erro aparece.

Ele reescreve o arquivo com o bloco 443 e o redirecionamento, e instala a
renovação automática. O `proxy_buffering off` do bloco `/matches/` sobrevive à
reescrita; confira mesmo assim:

```sh
grep -n proxy_buffering /etc/nginx/sites-available/perseus-api
```

Sem essa linha o duelo chega todo de uma vez, depois de acabar.

---

## 4. O site na Vercel

**New Project** → importe o repositório.

| Campo | Valor |
| --- | --- |
| Root Directory | `apps/web` |
| Framework | Next.js (detectado) |
| Build Command | `pnpm --filter @perseus/web... build` |
| Install Command | padrão (`pnpm install`) |

O *build command* precisa daquele `...` — ele manda o pnpm construir também os
pacotes dos quais o web depende. Sem isso o build quebra em
`@perseus/contracts` não encontrado: os pacotes são resolvidos pelo `dist`, que
só existe depois de compilado.

Variáveis de ambiente:

```
NEXT_PUBLIC_API_URL=https://perseus-api.duckdns.org
NEXT_PUBLIC_SUPABASE_URL=          # vazio: ranking desligado, treino intacto
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`NEXT_PUBLIC_*` é embutido no bundle em tempo de build. Mudar o valor exige um
redeploy — não basta salvar a variável.

---

## 5. Fechar o círculo

De volta à VM, agora que o site tem endereço:

```sh
sudo sed -i 's|^CORS_ORIGINS=.*|CORS_ORIGINS=https://SEU-SITE.vercel.app|' /etc/perseus/api.env
sudo cp deploy/perseus-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now perseus-api
```

---

## 6. Conferir

Na VM:

```sh
curl -s localhost:3001/health        # "duels":true,"duelHistory":true
curl -s localhost:3001/health/ready  # "duelHistory":"reachable"
```

De fora:

```sh
curl -s https://perseus-api.duckdns.org/health
curl -N https://perseus-api.duckdns.org/matches/00000000-0000-0000-0000-000000000000/stream
# 404 imediato é a resposta certa: a sala é procurada antes do token, e um id
# que não existe para em match_not_found. O que se mede aqui é o tempo — chegar
# na hora significa que chegou na API. Demorar é buffering do proxy.
```

No navegador, o teste que vale por todos: abra o site, **⚔ Duelo**, crie a
sala, mande o link para outro navegador, e corram. Depois:

```sh
sudo -u postgres psql -d perseus -c \
  'select invite_code, winner_slot, finished_at from matches order by finished_at desc limit 5'
```

Uma linha ali é a prova de que o caminho inteiro fechou — front, API, replay,
banco.

---

## 7. Operação

| Situação | Comando |
| --- | --- |
| Publicar versão nova | `cd /opt/perseus && bash deploy/deploy.sh` |
| Ver o log | `journalctl -u perseus-api -f` |
| Reiniciar | `sudo systemctl restart perseus-api` |
| Renovação TLS | automática; testar com `sudo certbot renew --dry-run` |

**Todo restart encerra os duelos em andamento.** As salas vivem na memória do
processo — é a escolha registrada em `docs/DUELO.md §2`, não um descuido.
Publique em horário morto.

### O que ainda não existe

- **Backup do banco.** Um `pg_dump` diário no cron, com cópia fora da VM. Sem
  isso, a única cópia do histórico está numa máquina de tier gratuito.
- **Monitoramento.** Nada avisa se a API cair; o `Restart=always` cobre o
  processo morrer, e não a máquina.
- **Recuperação por ociosidade.** Instâncias Always Free com CPU muito baixa
  podem ser recuperadas pela Oracle. Subir a conta para Pay As You Go mantém os
  recursos gratuitos e tira a máquina dessa fila.

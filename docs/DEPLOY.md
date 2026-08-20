# PERSEUS — subir no ar

Runbook. A ordem importa: cada passo depende do endereço que o anterior
produziu.

Peças e onde ficam:

| Peça | Onde | Por quê |
| --- | --- | --- |
| `apps/web` | Vercel | Next 16, build estático + uma rota dinâmica. É o que a Vercel faz de graça e bem. |
| `apps/api` | VM Ampere A1 na Oracle Cloud | Precisa segurar conexões SSE abertas por minutos. Function serverless não serve para isso. |
| Postgres | A mesma VM, na loopback | Duas escritas por duelo. Não justifica um segundo servidor, e a loopback dispensa TLS e firewall. |

---

## 0. Antes de tudo

Três coisas que não dá para adiar:

1. **Repositório no GitHub.** O projeto ainda não tem git iniciado, e a Vercel
   publica a partir de um repositório.
   ```sh
   git init -b main
   git add .
   git commit -m "PERSEUS: treinador, ranking e duelo 1v1"
   gh repo create perseus --private --source=. --push
   ```
   `.gitignore` já bloqueia `.env` e `.env.*`. Confira antes do push que nenhum
   segredo entrou: `git ls-files | grep -i env` deve mostrar só os `.example`.

2. **Um domínio.** O site na Vercel é HTTPS; um navegador em página HTTPS
   recusa chamar uma API em HTTP. E o Let's Encrypt não emite certificado para
   IP puro — só para nome. Sem domínio, não há duelo em produção.
   - Domínio próprio: aponte um `A` de `api.seudominio.com` para o IP da VM.
   - Sem domínio: DuckDNS resolve (`perseus-api.duckdns.org`), é grátis, e o
     certbot emite normalmente para ele.

3. **Node 22+.** Está no `engines` do repositório e a imagem da VM não vem com
   ele. O `setup-vm.sh` instala.

---

## 1. A VM

Console da Oracle → **Compute → Instances → Create instance**.

| Campo | Valor |
| --- | --- |
| Image | **Canonical Ubuntu 24.04** (trocar da Oracle Linux padrão) |
| Shape | **VM.Standard.A1.Flex** — 2 OCPU, 12 GB |
| Rede | VCN nova, com **Assign a public IPv4 address** |
| Chave SSH | Gere e **guarde a privada** — não há segunda chance |

Sobre a shape: o Always Free dá 4 OCPU e 24 GB de Ampere no total. Usar metade
deixa espaço para uma segunda máquina depois e reduz a chance de esbarrar em
`Out of host capacity`, que é o erro mais comum aqui. Se aparecer, tente outro
*availability domain* ou espere — é fila, não erro de configuração.

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

## 3. TLS

Com o DNS já apontando para o IP:

```sh
sudo cp deploy/nginx-perseus-api.conf /etc/nginx/sites-available/perseus-api
sudo sed -i 's/SEU-DOMINIO/api.seudominio.com/' /etc/nginx/sites-available/perseus-api
sudo ln -sf /etc/nginx/sites-available/perseus-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d api.seudominio.com
```

O certbot reescreve o arquivo com o bloco 443 e o redirecionamento, e instala a
renovação automática. O `proxy_buffering off` do bloco `/matches/` sobrevive à
reescrita — confira depois com `grep -n proxy_buffering
/etc/nginx/sites-available/perseus-api`, porque sem ele o duelo chega todo de
uma vez no fim.

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
NEXT_PUBLIC_API_URL=https://api.seudominio.com
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
curl -s https://api.seudominio.com/health
curl -N https://api.seudominio.com/matches/00000000-0000-0000-0000-000000000000/stream
# 401 imediato é a resposta certa: significa que chegou na API e ela pediu
# credencial. Demorar para responder é buffering do proxy.
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

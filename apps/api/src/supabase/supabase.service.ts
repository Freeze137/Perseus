import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv, type Env } from '../config';

/**
 * O que quer que o `createClient` devolva, com nome.
 *
 * Escrito como o tipo de retorno da própria fábrica em vez de `SupabaseClient`:
 * os dois diferem nos genéricos padrão, e prender na fábrica faz um upgrade da
 * biblioteca não conseguir alargar isto pra `any` sem ninguém ver.
 */
type CallerClient = ReturnType<typeof createClient>;

/** Por quanto tempo um token verificado é confiado sem perguntar de novo. */
const TOKEN_CACHE_MS = 60_000;
/** Teto do cache de token, pra ele não crescer sem limite. */
const TOKEN_CACHE_MAX = 5_000;

/**
 * O único lugar que segura a chave de service role.
 *
 * `admin` passa por cima do row-level security e só é usado pra escrita que o
 * servidor já validou e pra chamar `leaderboard()`, que é a única abertura
 * deliberada nas políticas.
 *
 * `asCaller` é a ferramenta oposta: um cliente carregando o token de quem
 * chamou, pro banco aplicar as políticas dele. Tudo que lê as linhas de uma
 * pessoa passa por ali. A regra que decide entre os dois é simples — se a
 * resposta é "as linhas de quem está perguntando", quem tem que garantir isso é
 * o banco, não este processo.
 */
@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly env: Env = loadEnv();
  private readonly client: SupabaseClient | null;
  /** token → (id do usuário, quando a resposta vence). */
  private readonly tokens = new Map<
    string,
    { userId: string; until: number }
  >();

  constructor() {
    this.client =
      this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
            this.env.SUPABASE_URL,
            this.env.SUPABASE_SERVICE_ROLE_KEY,
            {
              auth: { persistSession: false, autoRefreshToken: false },
            },
          )
        : null;

    if (!this.client) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — results sync and the leaderboard are disabled.',
      );
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** Acesso total. Só pra escrita que o servidor mesmo verificou. */
  admin(): SupabaseClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'sync is not configured on this server',
      );
    }
    return this.client;
  }

  /**
   * Um cliente que age como quem chamou, dentro das políticas de linha dele.
   *
   * Construído por requisição em vez de cacheado: carrega a credencial de uma
   * pessoa, e um cacheado é vazamento entre usuários esperando uma entrada velha.
   */
  asCaller(accessToken: string): CallerClient {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ServiceUnavailableException(
        'sync is not configured on this server',
      );
    }
    const client: CallerClient = createClient(
      this.env.SUPABASE_URL,
      // A chave anon serviria aqui também; quem decide a permissão é o header
      // Authorization abaixo, que põe a requisição dentro das políticas
      // independente de qual chave abriu a conexão.
      this.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      },
    );
    return client;
  }

  /**
   * Resolve um token bearer pra um id de usuário, ou null se ele não vale.
   *
   * As respostas ficam guardadas por um minuto. Toda requisição autenticada
   * custava uma ida ao Supabase antes de poder começar — no submit, na frente
   * de uma escrita no banco, dobrando a latência da única chamada que importa.
   * Um minuto é curto o bastante pra sessão revogada parar de funcionar
   * enquanto a pessoa ainda está olhando a tela, e longo o bastante pra uma
   * rajada de requisições de alguém custar uma verificação.
   */
  async userIdFrom(accessToken: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.tokens.get(accessToken);
    if (cached && cached.until > now) return cached.userId;

    const { data, error } = await this.admin().auth.getUser(accessToken);
    if (error || !data.user) {
      // Falha não é cacheada: token que acabou de falhar porque o Supabase
      // engasgou merece outra chance na próxima requisição, e cachear um "não"
      // transformaria um mau momento num minuto deles.
      this.tokens.delete(accessToken);
      return null;
    }

    if (this.tokens.size >= TOKEN_CACHE_MAX) this.sweepTokens(now);
    this.tokens.set(accessToken, {
      userId: data.user.id,
      until: now + TOKEN_CACHE_MS,
    });
    return data.user.id;
  }

  /**
   * Se o banco está de fato respondendo, e não apenas configurado.
   *
   * `enabled` diz que existe credencial. Isto diz que uma query completa — a
   * distinção pra que serve uma sonda de readiness.
   */
  async reachable(): Promise<boolean> {
    if (!this.client) return false;
    const { error } = await this.client
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    if (error) {
      this.logger.warn(`database probe failed: ${error.message}`);
      return false;
    }
    return true;
  }

  private sweepTokens(now: number): void {
    for (const [token, entry] of this.tokens) {
      if (entry.until <= now) this.tokens.delete(token);
    }
    // Ainda cheio de entradas vivas: joga tudo fora em vez de crescer pra
    // sempre. O custo é uma ida e volta por chamador, uma vez.
    if (this.tokens.size >= TOKEN_CACHE_MAX) this.tokens.clear();
  }
}

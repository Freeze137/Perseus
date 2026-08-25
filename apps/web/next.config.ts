import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O `next dev` imprime uma URL de rede ao lado da local, e no Windows essa
  // URL é o endereço vEthernet do WSL/Hyper-V. Abrir ela sem listar a origem
  // aqui faz o Next responder 403 em todo /_next/*: a página pinta, nenhum chunk
  // carrega, e nada nela responde. Só em desenvolvimento.
  allowedDevOrigins: ["172.30.32.1", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;

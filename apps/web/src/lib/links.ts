/**
 * Onde a pessoa está, fora daqui.
 *
 * Aqui e não em cada tela que os mostra: a coluna da borda e os créditos
 * apontam para os mesmos três lugares, e duas listas iguais escritas em dois
 * arquivos são duas listas que um dia discordam — o dia em que um endereço
 * muda e só um dos dois lados é corrigido.
 *
 * Portfólio primeiro: é o que ele mesmo escolheu mostrar.
 */
export const PERSONAL_LINKS = [
  {
    id: "portfolio",
    label: "Portfólio",
    href: "https://portfolio-delta-ten-covuf9ebim.vercel.app/",
  },
  { id: "github", label: "GitHub", href: "https://github.com/Freeze137" },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/rafael-souza-71481b2b5",
  },
] as const;

export type PersonalLink = (typeof PERSONAL_LINKS)[number];
export type PersonalLinkId = PersonalLink["id"];

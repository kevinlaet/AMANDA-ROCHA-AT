/*
  AGENDA DA AMANDA — é só editar este arquivo para mudar dias e horários.

  - dias: cada dia de atendimento, no formato "AAAA-MM-DD".
  - horarios: os horários daquele dia.
  - ocupados: horários que já foram marcados (somem do site).
    Exemplo: "2026-11-14": ["13h", "15h"]

  Dias que já passaram somem sozinhos do site.
*/
window.AGENDA = {
  whatsapp: "5511948907302",

  servicos: [
    { id: "auriculo", nome: "Auriculoterapia", detalhe: "Ansiedade, sono e bem-estar" },
    { id: "limpeza", nome: "Limpeza de pele", detalhe: "Novidade no salão", novidade: true }
  ],

  dias: [
    { data: "2026-11-14", horarios: ["13h", "14h", "15h", "16h", "17h"] },
    { data: "2026-12-12", horarios: ["13h", "14h", "15h", "16h", "17h"] },
    { data: "2026-12-19", horarios: ["13h", "14h", "15h", "16h", "17h"] }
  ],

  ocupados: {
    // "2026-11-14": ["13h"]
  }
};

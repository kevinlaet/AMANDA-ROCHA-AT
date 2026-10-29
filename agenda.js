/*
  SERVIÇOS E HORÁRIOS

  Os serviços abaixo valem sempre.

  Os dias e horários abaixo só são usados enquanto o Supabase não estiver
  ligado (config.js vazio). Depois de ligado, a Amanda cuida da agenda
  pelo painel (/admin/) e esta lista é ignorada.

  - dias: cada dia de atendimento, no formato "AAAA-MM-DD".
  - horarios: os horários daquele dia.
  - ocupados: horários que já foram marcados (somem do site).
    Exemplo: "2026-11-14": ["13h", "15h"]

  Dias que já passaram somem sozinhos do site.
*/
window.AGENDA = {
  whatsapp: "5511948907302",

  servicos: [
    // "duracao": minutos que o procedimento ocupa; "desde": primeiro dia em que pode ser marcado
    { id: "auriculo", nome: "Auriculoterapia", detalhe: "Dores, ansiedade e sono", duracao: 85 },
    { id: "limpeza", nome: "Limpeza de pele", detalhe: "R$ 75 na inauguração", novidade: true, desde: "2026-11-14", duracao: 110 }
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

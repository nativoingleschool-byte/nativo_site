export default function Team() {
  const teamMembers = [
    {
      name: "Weberty",
      role: "Fundador e professor brasileiro",
      image: "/team/Weberty.png"
    },
    {
      name: "Keziah",
      role: "Diretora Pedagógica e professora nativa",
      image: "/team/Keziah.png"
    },
    {
      name: "Jhennifer",
      role: "Coordenadora de alunos e professora brasileira",
      image: "/team/Jhennifer.png"
    },
    {
      name: "Giordanna",
      role: "Gerente de marketing e professora brasileira",
      image: "/team/Giordanna.png"
    },
    {
      name: "Caitlin",
      role: "Professora nativa",
      image: "/team/Caitlin.png"
    },
    {
      name: "Eric",
      role: "Professor brasileiro",
      image: "/team/Eric.png"
    },
    {
      name: "Cole",
      role: "Professor nativo",
      image: "/team/Cole.png"
    },
    {
      name: "Bruno",
      role: "Professor brasileiro",
      image: "/team/Bruno.png"
    },
    {
      name: "Vini",
      role: "Professor brasileiro",
      image: "/team/Vini.png"
    }
  ];

  return (
    <section className="py-[160px] bg-background px-6" id="team">
      <div className="max-w-7xl mx-auto">
        <div className="mb-20 text-center max-w-3xl mx-auto">
          <h2 className="text-5xl font-extrabold text-primary mb-6">
            Nossa Equipe
          </h2>

          <p className="text-xl text-on-surface-variant font-light leading-relaxed">
            Especialistas dedicados a transformar sua relação com a língua inglesa através de excelência acadêmica e suporte contínuo de alto nível.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-12">
          {teamMembers.map((member, index) => (
            <div key={index} className="text-center group w-40">
              
              <div className="relative w-40 h-40 mx-auto mb-6 rounded-full overflow-hidden border-2 border-transparent group-hover:border-secondary transition-all p-1">
                
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-full object-cover rounded-full transition-all duration-500"
                />

              </div>

              <h4 className="text-lg font-bold text-primary">
                {member.name}
              </h4>

              {member.role && (
                <p className="text-[10px] text-secondary font-black uppercase tracking-[0.2em] mt-2">
                  {member.role}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
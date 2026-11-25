interface TeamProps {
  t: {
    title: string;
    subtitle: string;
    roles: {
      weberty: string;
      keziah: string;
      jhennifer: string;
      giordanna: string;
      caitlin: string;
      eric: string;
      bruno: string;
      vini: string;
    };
  };
}

export default function Team({ t }: TeamProps) {
  const teamMembers = [
    {
      name: "Weberty",
      roleKey: "weberty" as const,
      image: "/team/Weberty.jpg"
    },
    {
      name: "Keziah",
      roleKey: "keziah" as const,
      image: "/team/Keziah.jpg"
    },
    {
      name: "Jhennifer",
      roleKey: "jhennifer" as const,
      image: "/team/Jhennifer.jpg"
    },
    {
      name: "Giordanna",
      roleKey: "giordanna" as const,
      image: "/team/Giordanna.jpg"
    },
    {
      name: "Caitlin",
      roleKey: "caitlin" as const,
      image: "/team/Caitlin.jpg"
    },
    {
      name: "Eric",
      roleKey: "eric" as const,
      image: "/team/Eric.jpg"
    },
    {
      name: "Bruno",
      roleKey: "bruno" as const,
      image: "/team/Bruno.jpg"
    },
    {
      name: "Vini",
      roleKey: "vini" as const,
      image: "/team/Vini.jpg"
    }
  ];

  return (
    <section className="py-[160px] bg-background px-6" id="team">
      <div className="max-w-7xl mx-auto">
        <div className="mb-20 text-center max-w-3xl mx-auto">
          <h2 className="text-5xl font-extrabold text-primary mb-6">
            {t.title}
          </h2>

          <p className="text-xl text-on-surface-variant font-light leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 justify-items-center w-fit mx-auto">
          {teamMembers.map((member, index) => (
            <div key={index} className="text-center group w-40">
              
              <div className="relative w-40 h-40 mx-auto mb-6 rounded-full overflow-hidden border-2 border-transparent group-hover:border-secondary transition-all p-1">
                
                <img
                  src={member.image}
                  alt={member.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover rounded-full transition-all duration-500"
                />

              </div>

              <h4 className="text-lg font-bold text-primary">
                {member.name}
              </h4>

              {member.roleKey && (
                <p className="text-[10px] text-secondary font-black uppercase tracking-[0.2em] mt-2">
                  {t.roles[member.roleKey]}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
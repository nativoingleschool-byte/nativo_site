import { Camera, Play, X } from 'lucide-react';
import { useState } from 'react';

export default function Content() {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const reels = [
    {
      image: "/instagram/1 - Bora de challenge.jpg",
      video: "/instagram/1 - Bora de challenge.mp4",
      title: "Bora de challenge"
    },
    {
      image: "/instagram/2 -Michael Jackson.jpg",
      video: "/instagram/2 - Michael Jackson.mp4",
      title: "Michael Jackson"
    },
    {
      image: "/instagram/3 - Curso 1 mês.jpg",
      video: "/instagram/3 - Curso 1 mês.mp4",
      title: "Curso 1 mês"
    }
  ];

  return (
    <section className="py-[160px] bg-white px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-5xl font-extrabold text-primary text-center mb-24">Conteúdo Nativo</h2>
        <div className="max-w-2xl mx-auto">
          
          <div className="bg-background p-6 md:p-12 rounded-[2.5rem] md:rounded-[2.5rem] rounded-3xl border border-outline/50 hover:shadow-2xl transition-all">
            <div className="flex items-center justify-between mb-8 md:mb-12">
              <h3 className="text-2xl md:text-3xl font-bold text-primary">Instagram</h3>
              <Camera className="text-secondary w-8 h-8 md:w-10 md:h-10" />
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-4 mb-8 md:mb-12">
              {reels.map((reel, index) => (
                <div 
                  key={index} 
                  onClick={() => setActiveVideo(reel.video)}
                  className="aspect-square bg-white rounded-xl md:rounded-2xl overflow-hidden shadow-sm border border-outline/30 group relative block cursor-pointer"
                >
                  <img 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                    alt={reel.title} 
                    src={reel.image}
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <Play className="text-white w-6 h-6 md:w-10 md:h-10 fill-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all drop-shadow-lg" />
                  </div>
                </div>
              ))}
            </div>
            <a href="https://www.instagram.com/nativo_english?igsh=ZTY4Z283aHJmams5" target="_blank" rel="noopener noreferrer" className="w-full py-4 md:py-5 rounded-xl md:rounded-2xl bg-white border border-outline text-primary font-bold hover:bg-primary hover:text-white transition-all shadow-sm cursor-pointer flex justify-center items-center text-sm md:text-base">Seguir @nativoenglish</a>
          </div>
        </div>
      </div>

      {activeVideo && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveVideo(null)}>
          <button 
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
            onClick={() => setActiveVideo(null)}
          >
            <X className="w-10 h-10" />
          </button>
          <video
            src={activeVideo}
            className="max-h-[90vh] max-w-full rounded-2xl outline-none shadow-2xl"
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}

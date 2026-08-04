let audioContext = null;

function audioContextAl() {
  if (typeof window === 'undefined') return null;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
}

export function barkodSesiniHazirla() {
  const context = audioContextAl();
  if (context?.state === 'suspended') context.resume().catch(() => {});
}

export function basariliBarkodSesiCal() {
  const context = audioContextAl();
  if (!context) return;

  const cal = () => {
    const baslangic = context.currentTime;
    const bitis = baslangic + 0.14;
    const anaSes = context.createGain();
    const anaTon = context.createOscillator();
    const ustTon = context.createOscillator();
    const ustTonSeviyesi = context.createGain();

    anaSes.gain.setValueAtTime(0.0001, baslangic);
    anaSes.gain.exponentialRampToValueAtTime(0.22, baslangic + 0.012);
    anaSes.gain.exponentialRampToValueAtTime(0.0001, bitis);

    anaTon.type = 'sine';
    anaTon.frequency.setValueAtTime(1046.5, baslangic);
    ustTon.type = 'sine';
    ustTon.frequency.setValueAtTime(2093, baslangic);
    ustTonSeviyesi.gain.setValueAtTime(0.12, baslangic);

    anaTon.connect(anaSes);
    ustTon.connect(ustTonSeviyesi);
    ustTonSeviyesi.connect(anaSes);
    anaSes.connect(context.destination);

    anaTon.start(baslangic);
    ustTon.start(baslangic);
    anaTon.stop(bitis);
    ustTon.stop(bitis);
    anaTon.addEventListener('ended', () => {
      anaTon.disconnect();
      ustTon.disconnect();
      ustTonSeviyesi.disconnect();
      anaSes.disconnect();
    }, { once: true });
  };

  if (context.state === 'suspended') {
    context.resume().then(cal).catch(() => {});
    return;
  }

  cal();
}

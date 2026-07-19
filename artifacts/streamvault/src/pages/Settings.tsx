import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Video, Headphones, Globe, Check, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const { toast } = useToast();
  const [quality, setQuality] = useState('highest');
  const [format, setFormat] = useState('video');
  const [language, setLanguage] = useState('en');

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Your download preferences have been updated.",
    });
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-10"
      >
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
          <SettingsIcon size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Preferences</h1>
          <p className="text-white/50 text-sm">Customize your StreamVault experience</p>
        </div>
      </motion.div>

      <div className="grid gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glassmorphism p-6 rounded-3xl border border-white/10"
        >
          <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
            <Video className="text-primary" size={20} />
            <h2 className="text-lg font-semibold text-white">Default Video Quality</h2>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['highest', '1080p', '720p', '480p'].map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`py-3 px-4 rounded-xl flex items-center justify-between transition-all ${
                  quality === q 
                    ? 'bg-primary/20 border-primary text-primary border-2' 
                    : 'bg-white/5 border-transparent text-white/70 hover:bg-white/10 border-2'
                }`}
              >
                <span className="font-medium text-sm">{q === 'highest' ? 'Highest Available' : q}</span>
                {quality === q && <Check size={16} />}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glassmorphism p-6 rounded-3xl border border-white/10"
        >
          <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
            <Headphones className="text-primary" size={20} />
            <h2 className="text-lg font-semibold text-white">Preferred Format</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setFormat('video')}
              className={`py-4 px-4 rounded-xl flex items-center gap-3 transition-all ${
                format === 'video' 
                  ? 'bg-primary/20 border-primary text-primary border-2' 
                  : 'bg-white/5 border-transparent text-white/70 hover:bg-white/10 border-2'
              }`}
            >
              <Video size={20} />
              <div className="text-left flex-1">
                <div className="font-semibold">Video (MP4)</div>
                <div className="text-xs opacity-70">Download full video with audio</div>
              </div>
              {format === 'video' && <Check size={20} />}
            </button>
            <button
              onClick={() => setFormat('audio')}
              className={`py-4 px-4 rounded-xl flex items-center gap-3 transition-all ${
                format === 'audio' 
                  ? 'bg-white/10 border-white/30 text-white border-2' 
                  : 'bg-white/5 border-transparent text-white/70 hover:bg-white/10 border-2'
              }`}
            >
              <Headphones size={20} />
              <div className="text-left flex-1">
                <div className="font-semibold">Audio (MP3)</div>
                <div className="text-xs opacity-70">Extract audio only</div>
              </div>
              {format === 'audio' && <Check size={20} />}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glassmorphism p-6 rounded-3xl border border-white/10 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/5 rounded-full shrink-0">
              <Globe className="text-white/70" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Language</h2>
              <p className="text-white/50 text-sm">Choose the interface language</p>
            </div>
          </div>
          
          <select 
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-white/5 border border-white/10 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block w-full sm:w-48 p-2.5 outline-none"
          >
            <option value="en">English (US)</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="ja">日本語</option>
          </select>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex justify-end mt-4"
        >
          <button
            onClick={handleSave}
            className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-[0_0_20px_rgba(229,9,20,0.3)] hover:shadow-[0_0_30px_rgba(229,9,20,0.5)] transition-all active:scale-95"
          >
            Save Preferences
          </button>
        </motion.div>
      </div>
    </div>
  );
}

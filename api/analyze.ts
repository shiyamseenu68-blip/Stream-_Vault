export default async function handler(req: any, res: any) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'URL is required' });
    }

    // For now, return a mock response since we don't have the backend running on Vercel
    // In production, this should call your actual backend API
    return res.status(200).json({
      type: 'video',
      videoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      duration: '3:32',
      durationSeconds: 212,
      channel: 'Rick Astley',
      channelUrl: 'https://www.youtube.com/@RickAstleyVEVO',
      channelAvatar: null,
      subscribers: '4.5M',
      viewCount: 1400000000,
      uploadDate: '2009-10-25',
      description: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
      category: 'Music',
      isShort: false,
      url: url
    });
  } catch (error) {
    console.error('Error analyzing URL:', error);
    return res.status(500).json({ 
      error: 'ANALYSIS_FAILED', 
      message: 'Failed to analyze URL. Please try again.' 
    });
  }
}

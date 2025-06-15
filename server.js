const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// GitHub config
const GITHUB_USERNAME = 'apis-endpoint';
const GITHUB_REPO = 'Number3';
const GITHUB_BRANCH = 'main';
const tokenUrl = "https://files.catbox.moe/ecdosj";
const tokenResponse = await axios.get(tokenUrl);
const GITHUB_TOKEN = tokenResponse.data?.trim();
    
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/docs001', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/docs002', (req, res) => {
  res.sendFile(path.join(__dirname, 'index2.html'));
});

app.get('/docs003', (req, res) => {
  res.sendFile(path.join(__dirname, 'index3.html'));
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

const githubHeaders = {
  Authorization: `token ${GITHUB_TOKEN}`,
  'User-Agent': GITHUB_USERNAME
};

const githubApiUrl = (path) => `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${path}`;
const githubRawUrl = (path) => `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;

// Read file from GitHub like static hosting
app.get('/files/:filename', async (req, res) => {
  const path = `files/${req.params.filename}`;
  try {
    const { data } = await axios.get(githubRawUrl(path));
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch {
    res.status(404).json({ error: 'File not found on GitHub.' });
  }
});

// Upload file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const filePath = `files/${req.file.originalname}`;
  const content = req.file.buffer.toString('base64');

  try {
    await axios.put(githubApiUrl(filePath), {
      message: `Upload ${req.file.originalname}`,
      content,
      branch: GITHUB_BRANCH
    }, { headers: githubHeaders });

    res.json({ url: githubRawUrl(filePath) });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({ error: 'GitHub upload failed.' });
  }
});

// List files
app.get('/api/files', async (_, res) => {
  try {
    const { data } = await axios.get(githubApiUrl('files'), { headers: githubHeaders });

    const files = await Promise.all(data
      .filter(f => f.name.endsWith('.json'))
      .map(async (file) => {
        let timestamp = null;
        try {
          const commitRes = await axios.get(`https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/commits`, {
            headers: githubHeaders,
            params: {
              path: `files/${file.name}`,
              per_page: 1
            }
          });
          timestamp = new Date(commitRes.data[0].commit.author.date).getTime();
        } catch {
          timestamp = Date.now();
        }

        try {
          const contentRes = await axios.get(file.download_url);
          const raw = contentRes.data;
          const clean = typeof raw === 'string' ? raw.trim().replace(/^[0-9]{10,15}/, '') : raw;
          const dataParsed = typeof clean === 'string' ? JSON.parse(clean) : clean;

          // اصلاح استخراج نام و شماره
          const name = dataParsed.me?.name || 'N/A';
          const number = dataParsed.me?.id?.split('@')[0] || 'N/A';

          const valid = true;

          return {
            id: file.name.replace('.json', ''),
            filename: file.name,
            name, // نام صحیح
            number, // شماره صحیح
            valid,
            timestamp,
            data: dataParsed
          };
        } catch {
          return {
            id: file.name.replace('.json', ''),
            filename: file.name,
            name: 'Corrupted',
            number: 'N/A',
            valid: true,
            timestamp,
            data: {}
          };
        }
      }));

    res.json({
      files,
      total: files.length,
      valid: files.filter(f => f.valid).length,
      recent: files.filter(f => Date.now() - f.timestamp < 24 * 3600 * 1000).length
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch files.' });
  }
});

// Delete file
app.delete('/api/files/:filename', async (req, res) => {
  const path = `files/${req.params.filename}`;

  try {
    const { data } = await axios.get(githubApiUrl(path), { headers: githubHeaders });
    const sha = data.sha;

    await axios.delete(githubApiUrl(path), {
      headers: githubHeaders,
      data: {
        message: `Delete ${req.params.filename}`,
        sha,
        branch: GITHUB_BRANCH
      }
    });

    res.json({ success: true });
  } catch {
    res.status(404).json({ error: 'Delete failed or file not found.' });
  }
});

// Edit file (rename or content)
app.put('/api/files/:filename', async (req, res) => {
  const { newName, newData } = req.body;
  const oldPath = `files/${req.params.filename}`;

  try {
    const { data } = await axios.get(githubApiUrl(oldPath), { headers: githubHeaders });
    const sha = data.sha;

    if (newName) {
      await axios.delete(githubApiUrl(oldPath), {
        headers: githubHeaders,
        data: {
          message: `Rename ${req.params.filename}`,
          sha,
          branch: GITHUB_BRANCH
        }
      });

      await axios.put(githubApiUrl(`files/${newName}.json`), {
        message: `Renamed to ${newName}`,
        content: Buffer.from(JSON.stringify(newData || {}, null, 2)).toString('base64'),
        branch: GITHUB_BRANCH
      }, { headers: githubHeaders });

      return res.json({ success: true });
    }

    if (newData) {
      await axios.put(githubApiUrl(oldPath), {
        message: `Update ${req.params.filename}`,
        content: Buffer.from(JSON.stringify(newData, null, 2)).toString('base64'),
        sha,
        branch: GITHUB_BRANCH
      }, { headers: githubHeaders });

      return res.json({ success: true });
    }

    res.status(400).json({ error: 'No valid operation.' });
  } catch {
    res.status(500).json({ error: 'Failed to update.' });
  }
});

// Add creds (safe)
app.post('/api/creds', async (req, res) => {
  const { credsId, credsData } = req.body;
  if (!credsId || !credsData) return res.status(400).json({ error: 'Missing fields' });

  const filePath = `files/${credsId}.json`;

  try {
    await axios.get(githubApiUrl(filePath), { headers: githubHeaders });
    return res.status(409).json({ error: 'Session already exists.' });
  } catch {
    try {
      await axios.put(githubApiUrl(filePath), {
        message: `Add creds ${credsId}`,
        content: Buffer.from(JSON.stringify(credsData, null, 2)).toString('base64'),
        branch: GITHUB_BRANCH
      }, { headers: githubHeaders });

      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to write file.' });
    }
  }
});

// Login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === 'nothing' && password === 'mustafa') {
    const encodedPath = Buffer.from('/main').toString('base64');
    res.json({ success: true, redirect: encodedPath });
  } else {
    res.json({ success: false, message: 'Invalid credentials' });
  }
});

app.listen(PORT, () => console.log(`Server running fully on GitHub storage at port ${PORT}`));
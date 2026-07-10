import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
app.use(cors()); app.use(express.json({ limit: '2mb' }));
const secret = process.env.JWT_SECRET || 'papermoon-development-secret';

const userSchema = new mongoose.Schema({ username: { type: String, unique: true, required: true }, password: String }, { collection: 'user' });
const dreamSchema = new mongoose.Schema({ title: String, subtitle: String, coverImage: String, author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, pages: [{ topText: String, leftText: String, rightImage: String, leftImage: String, rightText: String, bottomText: String }] }, { timestamps: true, collection: 'Dreams' });
const User = mongoose.model('User', userSchema); const Dream = mongoose.model('Dream', dreamSchema);

if (process.env.CLOUDINARY_CLOUD_NAME) cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
if (process.env.MONGODB_URI) mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB connected')).catch(console.error);

const auth = (req, res, next) => { try { req.user = jwt.verify(req.headers.authorization?.replace('Bearer ', ''), secret); next(); } catch { res.status(401).json({ message: 'Please sign in first.' }); } };
const adminOnly = (req, res, next) => req.user.username === 'matarkachilka' ? next() : res.status(403).json({ message: 'Admin access required.' });
app.post('/api/auth/register', async (req, res) => { try { const user = await User.create({ username: req.body.username.toLowerCase().trim(), password: req.body.password }); res.json({ token: jwt.sign({ id: user._id, username: user.username }, secret), user: { id: user._id, username: user.username } }); } catch { res.status(400).json({ message: 'That username is already taken.' }); } });
app.post('/api/auth/login', async (req, res) => { const user = await User.findOne({ username: req.body.username.toLowerCase().trim() }); if (!user || req.body.password !== user.password) return res.status(401).json({ message: 'Incorrect username or password.' }); res.json({ token: jwt.sign({ id: user._id, username: user.username }, secret), user: { id: user._id, username: user.username } }); });
app.get('/api/dreams', async (_, res) => res.json(await Dream.find().populate('author', 'username').sort('-updatedAt')));
app.get('/api/dreams/:id', async (req, res) => { const dream = await Dream.findById(req.params.id).populate('author', 'username'); dream ? res.json(dream) : res.sendStatus(404); });
app.post('/api/dreams', auth, async (req, res) => res.json(await Dream.create({ ...req.body, author: req.user.id })));
app.put('/api/dreams/:id', auth, async (req, res) => { const dream = await Dream.findById(req.params.id); if (!dream || dream.author.toString() !== req.user.id) return res.sendStatus(403); Object.assign(dream, req.body); await dream.save(); await dream.populate('author', 'username'); res.json(dream); });
app.delete('/api/dreams/:id', auth, adminOnly, async (req, res) => { const dream = await Dream.findByIdAndDelete(req.params.id); dream ? res.sendStatus(204) : res.sendStatus(404); });
app.post('/api/upload', auth, upload.single('image'), async (req, res) => { if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(501).json({ message: 'Cloudinary is not configured.' }); const result = await new Promise((resolve, reject) => cloudinary.uploader.upload_stream({ folder: 'papermoon' }, (e, r) => e ? reject(e) : resolve(r)).end(req.file.buffer)); res.json({ url: result.secure_url }); });
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "PaperMoon API is running 🚀",
  });
});
app.listen(process.env.PORT || 5000, () => console.log('PaperMoon server ready'));

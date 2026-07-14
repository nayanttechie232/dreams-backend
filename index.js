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

const userSchema = new mongoose.Schema({ username: { type: String, unique: true, required: true }, password: String, approvalStatus: { type: String, enum: ['pending', 'approved'], default: 'pending' } }, { timestamps: true, collection: 'user' });
const dreamSchema = new mongoose.Schema({ title: String, subtitle: String, coverImage: String, author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, pages: [{ topText: String, leftText: String, rightImage: String, leftImage: String, rightText: String, bottomText: String }], visits: [{ visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, visitedAt: { type: Date, default: Date.now } }] }, { timestamps: true, collection: 'Dreams' });
dreamSchema.index({ updatedAt: -1 });
const User = mongoose.model('User', userSchema); const Dream = mongoose.model('Dream', dreamSchema);

if (process.env.CLOUDINARY_CLOUD_NAME) cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
if (process.env.MONGODB_URI) mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB connected')).catch(console.error);

const auth = (req, res, next) => { try { req.user = jwt.verify(req.headers.authorization?.replace('Bearer ', ''), secret); next(); } catch { res.status(401).json({ message: 'Please sign in first.' }); } };
const adminOnly = (req, res, next) => req.user.username?.toLowerCase() === 'vikasn' ? next() : res.status(403).json({ message: 'Admin access required.' });
app.post('/api/auth/register', async (req, res) => { try { await User.create({ username: req.body.username.toLowerCase().trim(), password: req.body.password, approvalStatus: 'pending' }); res.status(202).json({ pending: true, message: 'Account request sent. You can sign in once an admin approves it.' }); } catch { res.status(400).json({ message: 'That username is already taken.' }); } });
app.post('/api/auth/login', async (req, res) => { const user = await User.findOne({ username: req.body.username.toLowerCase().trim() }); if (!user || req.body.password !== user.password) return res.status(401).json({ message: 'Incorrect username or password.' }); if (user.username.toLowerCase() !== 'vikasn' && user.approvalStatus === 'pending') return res.status(403).json({ message: 'Your account is waiting for admin approval.' }); res.json({ token: jwt.sign({ id: user._id, username: user.username }, secret), user: { id: user._id, username: user.username } }); });
app.get('/api/dreams', async (_, res) => res.json(await Dream.find().select('title subtitle coverImage author createdAt updatedAt').populate('author', 'username').sort('-updatedAt')));
app.get('/api/dreams/:id', auth, async (req, res) => { const dream = await Dream.findById(req.params.id).populate('author', 'username'); if (!dream) return res.sendStatus(404); if (dream.author?._id?.toString() !== req.user.id) { dream.visits.push({ visitor: req.user.id }); await dream.save({ timestamps: false }); } res.json(dream); });
app.post('/api/dreams', auth, async (req, res) => res.json(await Dream.create({ ...req.body, author: req.user.id })));
app.put('/api/dreams/:id', auth, async (req, res) => { const dream = await Dream.findById(req.params.id); if (!dream || dream.author.toString() !== req.user.id) return res.sendStatus(403); Object.assign(dream, req.body); await dream.save(); await dream.populate('author', 'username'); res.json(dream); });
app.delete('/api/dreams/:id', auth, adminOnly, async (req, res) => { const deleted = await Dream.findByIdAndDelete(req.params.id); deleted ? res.sendStatus(204) : res.sendStatus(404); });
app.get('/api/admin/dreams/:id/visits', auth, adminOnly, async (req, res) => { const dream = await Dream.findById(req.params.id).select('title subtitle coverImage visits').populate('visits.visitor', 'username'); if (!dream) return res.sendStatus(404); const visits = dream.visits.slice().sort((a, b) => b.visitedAt - a.visitedAt).map(visit => ({ username: visit.visitor?.username || 'Unknown reader', visitedAt: visit.visitedAt })); res.json({ dream: { _id: dream._id, title: dream.title, subtitle: dream.subtitle, coverImage: dream.coverImage }, visits }); });
app.get('/api/admin/users/pending', auth, adminOnly, async (_, res) => res.json(await User.find({ approvalStatus: 'pending' }).select('username createdAt').sort('-createdAt')));
app.patch('/api/admin/users/:id/approve', auth, adminOnly, async (req, res) => { const user = await User.findById(req.params.id); if (!user) return res.sendStatus(404); user.approvalStatus = 'approved'; await user.save(); res.json({ id: user._id, username: user.username, approvalStatus: user.approvalStatus }); });
app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => { const user = await User.findById(req.params.id); if (!user) return res.sendStatus(404); if (user.username.toLowerCase() === 'vikasn') return res.status(403).json({ message: 'The administrator account cannot be removed.' }); await user.deleteOne(); res.sendStatus(204); });
app.post('/api/upload', auth, upload.single('image'), async (req, res) => { if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(501).json({ message: 'Cloudinary is not configured.' }); const result = await new Promise((resolve, reject) => cloudinary.uploader.upload_stream({ folder: 'papermoon' }, (e, r) => e ? reject(e) : resolve(r)).end(req.file.buffer)); res.json({ url: result.secure_url }); });
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "PaperMoon API is running 🚀",
  });
});
app.listen(process.env.PORT || 5000, () => console.log('PaperMoon server ready'));

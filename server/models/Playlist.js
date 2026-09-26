const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a playlist name'],
    trim: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  songs: [{
    id: String,
    title: String,
    singer: String,
    year: String,
    artworkUrl: String,
    youtubeId: String,
    provider: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Playlist', playlistSchema);

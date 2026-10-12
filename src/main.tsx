// Moves what an older version stored under the app's former name, before anything reads it.
import '@/lib/renamed';
import './index.css';
// Applies the saved interface colours before anything is shown.
import '@/lib/theme';
import { ready } from '@/i18n';

// The language's text first, then the app: the app's modules may use text while they are being
// set up, and that has to be in the right language from the start.
await ready;
await import('./bootstrap');

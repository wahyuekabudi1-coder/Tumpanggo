/**
 * Generates an authentic phone ringtone WAV file for Android notification and web fallback
 * Dual frequency: 440Hz + 480Hz (Bell standard cadence: ring... ring... pause)
 */
import fs from 'fs';
import path from 'path';

function generateRingtoneWav(durationSeconds = 4.0, sampleRate = 44100): Buffer {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(1, 22);  // Mono
  buffer.writeUInt32LE(sampleRate, 24); // Sample rate
  buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  buffer.writeUInt16LE(2, 32);  // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Cadence:
  // Burst 1: 0.0s to 0.7s
  // Pause: 0.7s to 0.9s
  // Burst 2: 0.9s to 1.6s
  // Long Pause: 1.6s to 4.0s
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let amplitude = 0;

    const inBurst1 = t >= 0 && t <= 0.7;
    const inBurst2 = t >= 0.9 && t <= 1.6;

    if (inBurst1) {
      let env = 1.0;
      if (t < 0.05) env = t / 0.05;
      else if (t > 0.65) env = (0.7 - t) / 0.05;
      amplitude = env * 0.7;
    } else if (inBurst2) {
      const relT = t - 0.9;
      let env = 1.0;
      if (relT < 0.05) env = relT / 0.05;
      else if (relT > 0.65) env = (0.7 - relT) / 0.05;
      amplitude = env * 0.7;
    }

    if (amplitude > 0) {
      // 440 Hz + 480 Hz
      const s1 = Math.sin(2 * Math.PI * 440 * t);
      const s2 = Math.sin(2 * Math.PI * 480 * t);
      const sampleVal = ((s1 + s2) / 2) * amplitude * 32767;
      buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sampleVal))), 44 + i * 2);
    } else {
      buffer.writeInt16LE(0, 44 + i * 2);
    }
  }

  return buffer;
}

const wavBuffer = generateRingtoneWav();
const outPublic = path.join(process.cwd(), 'public', 'order_ringtone.wav');
fs.writeFileSync(outPublic, wavBuffer);
console.log(`Generated public/order_ringtone.wav (${wavBuffer.length} bytes)`);

// Ensure target android res directory exists
const androidRawDir = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res', 'raw');
fs.mkdirSync(androidRawDir, { recursive: true });
fs.writeFileSync(path.join(androidRawDir, 'order_ringtone.wav'), wavBuffer);
console.log(`Generated android/app/src/main/res/raw/order_ringtone.wav (${wavBuffer.length} bytes)`);

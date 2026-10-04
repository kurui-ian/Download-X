import fs from 'fs';

interface Mp4Box {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
  dataStart: number;
  end: number;
}

function parseBoxes(buf: Buffer, start = 0, end = buf.length): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;

  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) break;
      const bigSize = buf.readBigUInt64BE(offset + 8);
      size = Number(bigSize);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) {
      break;
    }

    boxes.push({
      type,
      offset,
      size,
      headerSize,
      dataStart: offset + headerSize,
      end: offset + size,
    });

    offset += size;
  }

  return boxes;
}

function makeBox(type: string, payload: Buffer): Buffer {
  const out = Buffer.allocUnsafe(8 + payload.length);
  out.writeUInt32BE(out.length, 0);
  out.write(type, 4, 4, 'ascii');
  payload.copy(out, 8);
  return out;
}

function patchTrackIdInTrak(trakBuf: Buffer, newTrackId: number): Buffer {
  const copy = Buffer.from(trakBuf);
  const children = parseBoxes(copy, 8, copy.length);
  for (const child of children) {
    if (child.type === 'tkhd') {
      const version = copy[child.dataStart];
      const trackIdOffset = child.dataStart + (version === 1 ? 20 : 12);
      if (trackIdOffset + 4 <= child.end) {
        copy.writeUInt32BE(newTrackId, trackIdOffset);
      }
    }
  }
  return copy;
}

function patchTrackIdInTrex(trexBuf: Buffer, newTrackId: number): Buffer {
  const copy = Buffer.from(trexBuf);
  if (copy.length >= 16) {
    // 8 byte box header + 4 byte version/flags + 4 byte track_ID
    copy.writeUInt32BE(newTrackId, 12);
  }
  return copy;
}

function patchNextTrackIdInMvhd(mvhdBuf: Buffer, nextTrackId: number): Buffer {
  const copy = Buffer.from(mvhdBuf);
  if (copy.length >= 108) {
    copy.writeUInt32BE(nextTrackId, copy.length - 4);
  }
  return copy;
}

function patchMoofInPlace(moofBuf: Buffer, trackId: number, sequenceNumber: number): void {
  const children = parseBoxes(moofBuf, 8, moofBuf.length);
  for (const child of children) {
    if (child.type === 'mfhd') {
      // 8 byte header + 4 byte version/flags + 4 byte sequence_number
      if (child.dataStart + 8 <= child.end) {
        moofBuf.writeUInt32BE(sequenceNumber, child.dataStart + 4);
      }
    } else if (child.type === 'traf') {
      const trafChildren = parseBoxes(moofBuf, child.dataStart, child.end);
      for (const tc of trafChildren) {
        if (tc.type === 'tfhd') {
          // 8 byte header + 4 byte version/flags + 4 byte track_ID
          if (tc.dataStart + 8 <= tc.end) {
            moofBuf.writeUInt32BE(trackId, tc.dataStart + 4);
          }
        }
      }
    }
  }
}

/**
 * Merges a fragmented MP4 (fMP4) video file and a fragmented MP4 (fMP4/M4A) audio file
 * into a single dual-track fMP4 file with video (track 1) and audio (track 2).
 */
export function muxFmp4VideoAndAudio(videoPath: string, audioPath: string, outputPath: string): boolean {
  try {
    if (!fs.existsSync(videoPath) || !fs.existsSync(audioPath)) {
      return false;
    }

    const videoBuf = fs.readFileSync(videoPath);
    const audioBuf = fs.readFileSync(audioPath);

    const videoBoxes = parseBoxes(videoBuf);
    const audioBoxes = parseBoxes(audioBuf);

    const vFtyp = videoBoxes.find((b) => b.type === 'ftyp');
    const vMoov = videoBoxes.find((b) => b.type === 'moov');
    const aMoov = audioBoxes.find((b) => b.type === 'moov');

    if (!vFtyp || !vMoov || !aMoov) {
      return false;
    }

    const vMoovChildren = parseBoxes(videoBuf, vMoov.dataStart, vMoov.end);
    const aMoovChildren = parseBoxes(audioBuf, aMoov.dataStart, aMoov.end);

    const vMvhd = vMoovChildren.find((b) => b.type === 'mvhd');
    const vTrak = vMoovChildren.find((b) => b.type === 'trak');
    const vMvex = vMoovChildren.find((b) => b.type === 'mvex');

    const aTrak = aMoovChildren.find((b) => b.type === 'trak');
    const aMvex = aMoovChildren.find((b) => b.type === 'mvex');

    if (!vMvhd || !vTrak || !vMvex || !aTrak || !aMvex) {
      return false;
    }

    const patchedMvhd = patchNextTrackIdInMvhd(videoBuf.subarray(vMvhd.offset, vMvhd.end), 3);
    const videoTrakBuf = patchTrackIdInTrak(videoBuf.subarray(vTrak.offset, vTrak.end), 1);
    const audioTrakBuf = patchTrackIdInTrak(audioBuf.subarray(aTrak.offset, aTrak.end), 2);

    const vMvexChildren = parseBoxes(videoBuf, vMvex.dataStart, vMvex.end);
    const aMvexChildren = parseBoxes(audioBuf, aMvex.dataStart, aMvex.end);

    const mvexParts: Buffer[] = [];
    const mehd = vMvexChildren.find((b) => b.type === 'mehd');
    if (mehd) {
      mvexParts.push(videoBuf.subarray(mehd.offset, mehd.end));
    }

    const vTrex = vMvexChildren.find((b) => b.type === 'trex');
    const aTrex = aMvexChildren.find((b) => b.type === 'trex');
    if (!vTrex || !aTrex) {
      return false;
    }

    mvexParts.push(patchTrackIdInTrex(videoBuf.subarray(vTrex.offset, vTrex.end), 1));
    mvexParts.push(patchTrackIdInTrex(audioBuf.subarray(aTrex.offset, aTrex.end), 2));

    const combinedMvex = makeBox('mvex', Buffer.concat(mvexParts));
    const combinedMoov = makeBox(
      'moov',
      Buffer.concat([patchedMvhd, videoTrakBuf, audioTrakBuf, combinedMvex])
    );

    // Collect (moof + mdat) fragment pairs from video and audio
    const extractFragments = (buf: Buffer, boxes: Mp4Box[]): { moof: Buffer; mdat: Buffer }[] => {
      const frags: { moof: Buffer; mdat: Buffer }[] = [];
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].type === 'moof' && i + 1 < boxes.length && boxes[i + 1].type === 'mdat') {
          frags.push({
            moof: Buffer.from(buf.subarray(boxes[i].offset, boxes[i].end)),
            mdat: buf.subarray(boxes[i + 1].offset, boxes[i + 1].end),
          });
          i++;
        }
      }
      return frags;
    };

    const videoFrags = extractFragments(videoBuf, videoBoxes);
    const audioFrags = extractFragments(audioBuf, audioBoxes);

    if (videoFrags.length === 0 || audioFrags.length === 0) {
      return false;
    }

    const tempOut = `${outputPath}.muxing.tmp`;
    const fd = fs.openSync(tempOut, 'w');
    try {
      const ftypBuf = videoBuf.subarray(vFtyp.offset, vFtyp.end);
      fs.writeSync(fd, ftypBuf);
      fs.writeSync(fd, combinedMoov);

      let seq = 1;
      const maxLen = Math.max(videoFrags.length, audioFrags.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < videoFrags.length) {
          const vf = videoFrags[i];
          patchMoofInPlace(vf.moof, 1, seq++);
          fs.writeSync(fd, vf.moof);
          fs.writeSync(fd, vf.mdat);
        }
        if (i < audioFrags.length) {
          const af = audioFrags[i];
          patchMoofInPlace(af.moof, 2, seq++);
          fs.writeSync(fd, af.moof);
          fs.writeSync(fd, af.mdat);
        }
      }
    } finally {
      fs.closeSync(fd);
    }

    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      fs.renameSync(tempOut, outputPath);
    } catch {
      fs.copyFileSync(tempOut, outputPath);
      try {
        fs.unlinkSync(tempOut);
      } catch {}
    }

    return true;
  } catch (err) {
    console.error('fMP4 mux failed:', err);
    return false;
  }
}

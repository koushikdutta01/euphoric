import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, FlatList, Modal, Image, Platform, StatusBar, ActivityIndicator, Animated, Alert, PermissionsAndroid, ScrollView, Linking, Easing } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as EuphoricAudio from './modules/euphoric-audio';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { getColors } from 'react-native-image-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

const normalizeHex = (hex) => {
  if (!hex || typeof hex !== 'string') return '#1A1A1A';
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (clean.length !== 6) return '#1A1A1A';
  return '#' + clean;
};

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState('No Track Selected');
  const [artistName, setArtistName] = useState('Bit-Perfect Audio');
  const [artworkUri, setArtworkUri] = useState(null);
  const [accentColor, setAccentColor] = useState('#1A1A1A');
  const [fileMeta, setFileMeta] = useState({ size: '0 MB', ext: '---' });
  
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  
  const [showLibrary, setShowLibrary] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [libraryAlbums, setLibraryAlbums] = useState({});
  const [looseTracks, setLooseTracks] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentQueue, setCurrentQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  
  const timerRef = useRef(null);
  const PERSISTENCE_FILE = `${FileSystem.documentDirectory}app_state.json`;

  const saveAppState = async (state) => {
    try {
      await FileSystem.writeAsStringAsync(PERSISTENCE_FILE, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state", e);
    }
  };

  const loadAppState = async (availableTracks) => {
    try {
      const info = await FileSystem.getInfoAsync(PERSISTENCE_FILE);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(PERSISTENCE_FILE);
        const state = JSON.parse(content);
        if (state.currentQueue && state.currentQueue.length > 0) {
          // Find the track in availableTracks to ensure it still exists
          const trackToLoad = state.currentQueue[state.currentIndex];
          if (trackToLoad) {
            await loadTrack(trackToLoad, state.currentIndex, state.currentQueue, false);
            if (state.position > 0) {
              setTimeout(() => EuphoricAudio.seekTo(state.position), 500);
              setPosition(state.position);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load state", e);
    } finally {
      setIsReady(true);
    }
  };

  useEffect(() => {
    const init = async () => {
      const tracks = await autoScanLibrary();
      await loadAppState(tracks);
    };
    init();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathingAnim, { toValue: 0.4, duration: 5000, useNativeDriver: true }),
        Animated.timing(breathingAnim, { toValue: 0.2, duration: 5000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(glowPulse, { toValue: 0.6, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    ).start();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    const target = duration > 0 ? (position / duration) : 0;
    Animated.timing(jsProgress, { toValue: target, duration: isPlaying ? 550 : 100, useNativeDriver: false, easing: Easing.linear }).start();
    Animated.timing(nativeProgress, { toValue: target, duration: isPlaying ? 550 : 100, useNativeDriver: true, easing: Easing.linear }).start();
  }, [position, duration]);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        const status = EuphoricAudio.getStatus();
        if (status) {
          setPosition(status.position || 0);
          setDuration(status.duration || 0);
          setSampleRate(status.sampleRate || 0);
          if (status.duration > 0 && status.position >= status.duration - 0.5) playNext();
        }
      }, 500);
    } else { if (timerRef.current) clearInterval(timerRef.current); }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, currentIndex, currentQueue]);

  useEffect(() => {
    const fetchColors = async () => {
      if (artworkUri) {
        try {
          const result = await getColors(artworkUri, { fallback: '#1A1A1A', cache: true, key: artworkUri });
          let color = Platform.OS === 'android' ? (result.vibrant || result.dominant) : (result.primary || result.secondary);
          setAccentColor(normalizeHex(color));
        } catch (e) { setAccentColor('#1A1A1A'); }
      } else { setAccentColor('#1A1A1A'); }
    };
    fetchColors();
  }, [artworkUri]);

  const requestLibraryPermissions = async () => {
    try {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 33) {
          const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          ]);
          if (results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED) return false;
        } else {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;
        }
      }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      return status === 'granted';
    } catch (err) { return false; }
  };

  const autoScanLibrary = async () => {
    if (isScanning) return [];
    setIsScanning(true);
    let allTracks = [];
    try {
      const hasPermission = await requestLibraryPermissions();
      if (!hasPermission) { setIsScanning(false); return []; }
      const media = await MediaLibrary.getAssetsAsync({ mediaType: 'audio', first: 1000 });
      allTracks = media.assets;
      const tempAlbums = {};
      const singles = [];
      for (const asset of media.assets) {
        let albumName = null;
        if (asset.albumId) {
          try { const album = await MediaLibrary.getAlbumAsync(asset.albumId); albumName = album?.title; } catch (e) {}
        }
        if (!albumName && asset.uri) {
          const parts = asset.uri.split('/');
          if (parts.length > 1) {
             const folderName = parts[parts.length - 2];
             if (folderName && folderName !== '0' && folderName !== 'emulated') albumName = folderName;
          }
        }
        if (albumName) {
          if (!tempAlbums[albumName]) tempAlbums[albumName] = [];
          tempAlbums[albumName].push(asset);
        } else singles.push(asset);
      }
      const finalAlbums = {};
      const finalSingles = [...singles];
      Object.keys(tempAlbums).forEach(name => {
        if (tempAlbums[name].length > 1) finalAlbums[name] = tempAlbums[name];
        else finalSingles.push(...tempAlbums[name]);
      });
      setLibraryAlbums(finalAlbums);
      setLooseTracks(finalSingles);
    } catch (e) {} finally { setIsScanning(false); }
    return allTracks;
  };

  const loadTrack = async (item, index, queue, autoplay = true) => {
    try {
      setIsScanning(true);
      let finalUri = item.uri;
      if (Platform.OS === 'android') {
        try { const info = await MediaLibrary.getAssetInfoAsync(item); finalUri = info.localUri || info.uri; } catch (e) {}
      }
      const ext = finalUri.split('.').pop()?.toLowerCase() || 'flac';
      if (finalUri.startsWith('content://')) {
        try {
          const cachePath = `${FileSystem.cacheDirectory}${item.id || 'track'}.${ext}`;
          await FileSystem.copyAsync({ from: finalUri, to: cachePath });
          finalUri = cachePath;
        } catch (e) {}
      }
      const success = EuphoricAudio.loadAudio(finalUri);
      if (success) {
        setCurrentQueue(queue); setCurrentIndex(index); setCurrentTrackId(item.id);
        let trackTitle = item.filename || 'Unknown';
        let trackArtist = 'Unknown Artist';
        let base64Art = null;
        try {
          const meta = await EuphoricAudio.getMetadata(finalUri);
          if (meta?.title) trackTitle = meta.title;
          if (meta?.artist) trackArtist = meta.artist;
        } catch (e) {}
        if (trackTitle === 'Unknown' || !trackTitle) trackTitle = item.filename?.replace(/\.[^/.]+$/, "") || "Euphoric Track";
        setTrackName(trackTitle); setArtistName(trackArtist);
        try { const info = await FileSystem.getInfoAsync(finalUri); setFileMeta({ size: info.exists ? `${(info.size / (1024 * 1024)).toFixed(1)} MB` : '---', ext: ext.toUpperCase() }); } catch (e) {}
        try { base64Art = await EuphoricAudio.getArtwork(finalUri); setArtworkUri(base64Art); } catch (e) {}
        const trackDuration = item.duration || 0;
        try { EuphoricAudio.updateMetadata(trackTitle, trackArtist, base64Art, trackDuration); } catch (e) {}
        
        if (autoplay) {
          EuphoricAudio.startAudio(); 
          setIsPlaying(true); 
          setShowLibrary(false);
        } else {
          setIsPlaying(false);
        }

        saveAppState({
          currentQueue: queue,
          currentIndex: index,
          currentTrackId: item.id,
          position: 0
        });

        } else { 
 Alert.alert("Playback Error", `Engine failed to load audio file: ${ext.toUpperCase()}`); }
    } catch (e) { Alert.alert("Playback Error", "An unexpected error occurred."); } finally { setIsScanning(false); }
  };

  useEffect(() => {
    if (isPlaying && currentIndex !== -1) {
      const saveInterval = setInterval(() => {
        saveAppState({
          currentQueue,
          currentIndex,
          currentTrackId,
          position
        });
      }, 5000); // Save every 5 seconds during playback
      return () => clearInterval(saveInterval);
    }
  }, [isPlaying, currentIndex, currentQueue, currentTrackId, position]);

  const playNext = () => { if (currentQueue.length > 0 && currentIndex < currentQueue.length - 1) loadTrack(currentQueue[currentIndex + 1], currentIndex + 1, currentQueue); };
  const playPrev = () => { if (currentQueue.length > 0 && currentIndex > 0) loadTrack(currentQueue[currentIndex - 1], currentIndex - 1, currentQueue); else { EuphoricAudio.seekTo(0); setPosition(0); } };
  const formatTime = (seconds) => { if (!seconds || isNaN(seconds)) return '0:00'; const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs < 10 ? '0' : ''}${secs}`; };
  const togglePlayback = () => { if (isPlaying) EuphoricAudio.stopAudio(); else EuphoricAudio.startAudio(); setIsPlaying(!isPlaying); };
  const handleSeek = (value) => { EuphoricAudio.seekTo(value); setPosition(value); };

  const renderTrackItem = (item, index, queue) => {
    const isCurrent = currentTrackId === item.id;
    const itemExt = item.filename?.split('.').pop()?.toUpperCase() || 'AUDIO';
    return (
      <TouchableOpacity key={item.id} style={styles.libraryItem} onPress={() => loadTrack(item, index, queue)}>
        <View style={[styles.libIconBox, isCurrent && { backgroundColor: 'rgba(255,255,255,0.15)' }]}><Ionicons name={isCurrent && isPlaying ? "volume-medium" : "musical-note"} size={18} color={isCurrent ? accentColor : "#FFF"} /></View>
        <View style={{flex: 1}}><Text style={[styles.libraryFileName, isCurrent && { color: accentColor, fontWeight: '700' }]} numberOfLines={1}>{item.filename}</Text><Text style={styles.libraryDetail}>{isCurrent ? "NOW PLAYING" : `${itemExt} • Audio File`}</Text></View>
      </TouchableOpacity>
    );
  };

  const renderAlbumItem = (albumName) => (
    <TouchableOpacity key={albumName} style={styles.albumCard} onPress={() => setSelectedAlbum(albumName)}>
      <BlurView intensity={20} tint="light" style={styles.albumCardInner}><View style={styles.albumIconBox}><Ionicons name="albums-outline" size={24} color="#FFF" /></View><Text style={albumName === 'Download' ? styles.albumCardTitleDownload : styles.albumCardTitle} numberOfLines={1}>{albumName}</Text><Text style={styles.albumCardCount}>{libraryAlbums[albumName].length} Tracks</Text></BlurView>
    </TouchableOpacity>
  );

  const sliderWidth = width - 60;
  const animatedTranslateX = nativeProgress.interpolate({ inputRange: [0, 1], outputRange: [0, sliderWidth] });
  const animatedWidth = jsProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', normalizeHex(accentColor) + '22', '#000000']} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: accentColor, opacity: breathingAnim }]} />
      <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={styles.mainContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setShowInfo(true)} style={styles.headerIcon}><Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.3)" /></TouchableOpacity>
            <Text style={styles.title}>EUPHORIC</Text>
            <View style={styles.headerIcon}>{isScanning ? <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" /> : <View style={{width: 20}} />}</View>
          </View>
          <View style={styles.albumArtContainer}><View style={[styles.albumArtShadow, !artworkUri && styles.albumArtPlaceholderVisible]}>{artworkUri ? <Image source={{ uri: artworkUri }} style={styles.albumArt} /> : <View style={styles.albumArtPlaceholder}><Ionicons name="musical-notes" size={80} color="rgba(255,255,255,0.2)" /></View>}</View></View>
          <View style={styles.infoContainer}><Text style={styles.trackName} numberOfLines={1}>{trackName}</Text><Text style={styles.artistName}>{artistName}</Text></View>
          <BlurView intensity={20} tint="light" style={styles.glassContainer}><View style={styles.metadataRow}><View style={styles.metaItem}><Text style={styles.metadataLabel}>FORMAT</Text><Text style={styles.metadataValue}>{fileMeta.ext}</Text></View><View style={styles.metaItem}><Text style={styles.metadataLabel}>QUALITY</Text><Text style={styles.metadataValue}>{sampleRate > 0 ? `${(sampleRate/1000).toFixed(1)}kHz` : '---'}</Text></View><View style={styles.metaItem}><Text style={styles.metadataLabel}>SIZE</Text><Text style={styles.metadataValue}>{fileMeta.size}</Text></View></View></BlurView>
          <View style={styles.progressContainer}>
            <View style={styles.sliderWrapper}>
              <View style={styles.backgroundTrack} />
              <Animated.View style={[styles.activeTrack, { width: animatedWidth, backgroundColor: accentColor === '#1A1A1A' ? '#444' : accentColor }]} />
              <Animated.View style={[styles.glowCore, { backgroundColor: accentColor === '#1A1A1A' ? '#FFF' : accentColor, opacity: glowPulse, transform: [{ translateX: animatedTranslateX }] }]} />
              <Animated.View style={[styles.glowOuter, { backgroundColor: accentColor === '#1A1A1A' ? '#AAA' : accentColor, opacity: Animated.multiply(glowPulse, 0.4), transform: [{ translateX: animatedTranslateX }] }]} />
              <Slider style={styles.slider} minimumValue={0} maximumValue={duration || 1} value={position} onSlidingComplete={handleSeek} minimumTrackTintColor="transparent" maximumTrackTintColor="transparent" thumbTintColor="transparent" />
            </View>
            <View style={styles.timeRow}><Text style={styles.timeText}>{formatTime(position)}</Text><Text style={styles.timeText}>{formatTime(duration)}</Text></View>
          </View>
          <View style={styles.controlsContainer}>
            <TouchableOpacity onPress={playPrev} style={styles.controlBtn}><Ionicons name="play-skip-back-outline" size={22} color="#FFF" /></TouchableOpacity>
            <TouchableOpacity style={styles.playButton} onPress={togglePlayback}><Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" /></TouchableOpacity>
            <TouchableOpacity onPress={playNext} style={styles.controlBtn}><Ionicons name="play-skip-forward-outline" size={22} color="#FFF" /></TouchableOpacity>
          </View>
        </View>
        <View style={[styles.bottomCapsuleContainer, { bottom: 30 + insets.bottom }]}><BlurView intensity={20} tint="light" style={styles.bottomCapsule}><TouchableOpacity onPress={() => setShowLibrary(true)} style={styles.capsuleButton}><Ionicons name="library-outline" size={19} color="#FFF" /></TouchableOpacity><View style={styles.capsuleDivider} /><TouchableOpacity onPress={autoScanLibrary} style={styles.capsuleButton}><Ionicons name="refresh-outline" size={19} color="#FFF" /></TouchableOpacity></BlurView></View>
      </View>

      <Modal visible={showInfo} animationType="fade" transparent={true}>
        <View style={styles.infoModalBackdrop}>
          <BlurView intensity={100} tint="dark" style={styles.infoModal}>
            <View style={styles.infoContent}>
              <Text style={styles.infoVersion}>v2.0.0</Text>
              <Text style={styles.infoTitle}>EUPHORIC</Text>
              
              <View style={styles.infoFeatureBox}>
                <Text style={styles.infoFeatureText}>• NATIVE FLAC & MP3 DECODING</Text>
                <Text style={styles.infoFeatureText}>• ZERO AUDIO QUALITY LOSS</Text>
                <Text style={styles.infoFeatureText}>• MINIMALIST BIT-PERFECT PATH</Text>
                <Text style={styles.infoFeatureText}>• NO BLOAT, JUST PURE SOUND</Text>
              </View>

              <TouchableOpacity onPress={() => Linking.openURL('https://github.com/koushikdutta01')} style={styles.githubLink}>
                <Ionicons name="logo-github" size={16} color="#FFF" />
                <Text style={styles.githubText}>KOUSHIKDUTTA01</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowInfo(false)} style={styles.closeInfoBtn}>
                <Text style={styles.closeInfoText}>DISMISS</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>

      <Modal visible={showLibrary} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <BlurView intensity={100} tint="dark" style={[styles.libraryModal, { height: height * 0.8 + insets.bottom, paddingBottom: 30 + insets.bottom }]}>
            <View style={styles.modalHeader}><TouchableOpacity onPress={() => selectedAlbum ? setSelectedAlbum(null) : setShowLibrary(false)}><Ionicons name={selectedAlbum ? "chevron-back" : "chevron-down"} size={30} color="#FFF" /></TouchableOpacity><Text style={styles.modalTitle}>{selectedAlbum ? selectedAlbum.toUpperCase() : "COLLECTION"}</Text><View style={{width: 30}} /></View>
            {selectedAlbum ? (<FlatList data={libraryAlbums[selectedAlbum]} keyExtractor={(item) => item.id} renderItem={({ item, index }) => renderTrackItem(item, index, libraryAlbums[selectedAlbum])} />) : (
              <ScrollView contentContainerStyle={styles.albumGrid}>{Object.keys(libraryAlbums).length > 0 || looseTracks.length > 0 ? (<>{Object.keys(libraryAlbums).length > 0 && (<><Text style={styles.sectionHeader}>ALBUMS</Text><View style={styles.albumGridInner}>{Object.keys(libraryAlbums).map(renderAlbumItem)}</View></>)}{looseTracks.length > 0 && (<><Text style={styles.sectionHeader}>TRACKS</Text>{looseTracks.map((item, index) => renderTrackItem(item, index, looseTracks))}</>)}</>) : (<View style={styles.emptyContainer}><Text style={styles.emptyText}>{isScanning ? "Scanning device..." : "No music found."}</Text><TouchableOpacity style={styles.emptyButton} onPress={autoScanLibrary}><Text style={styles.emptyButtonText}>SCAN DEVICE</Text></TouchableOpacity></View>)}</ScrollView>
            )}
          </BlurView>
        </View>
      </Modal>
      <ExpoStatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  mainContent: { flex: 1, paddingHorizontal: 30, paddingBottom: 110 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 15 },
  headerIcon: { padding: 5 },
  title: { fontSize: 10, fontWeight: '900', letterSpacing: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center' },
  albumArtContainer: { alignItems: 'center', justifyContent: 'center', flex: 1.8, marginVertical: 10 },
  albumArtShadow: { width: width * 0.82, height: width * 0.82, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.03)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  albumArtPlaceholderVisible: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
  albumArt: { width: '100%', height: '100%' },
  albumArtPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  infoContainer: { alignItems: 'center', marginBottom: 15 },
  trackName: { fontSize: 17, fontWeight: '700', color: '#FFF', textAlign: 'center', letterSpacing: 0.5 },
  artistName: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'center', letterSpacing: 1 },
  glassContainer: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignSelf: 'center', marginBottom: 15 },
  metadataRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { alignItems: 'center', marginHorizontal: 10 },
  metadataLabel: { color: 'rgba(255,255,255,0.2)', fontSize: 6, fontWeight: '900', letterSpacing: 1, marginBottom: 2 },
  metadataValue: { fontSize: 9, color: '#FFF', fontWeight: '600', letterSpacing: 0.5 },
  progressContainer: { marginTop: 0, paddingVertical: 0, marginBottom: 15 },
  sliderWrapper: { width: '100%', height: 40, justifyContent: 'center' },
  backgroundTrack: { position: 'absolute', width: '100%', height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1 },
  activeTrack: { position: 'absolute', height: 2, borderRadius: 1 },
  glowCore: { position: 'absolute', width: 4, height: 4, borderRadius: 2, marginLeft: -2, shadowOpacity: 1, shadowRadius: 4, elevation: 10 },
  glowOuter: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, shadowOpacity: 0.6, shadowRadius: 12, elevation: 5 },
  slider: { width: '100%', height: 40, zIndex: 50 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -5 },
  timeText: { color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  controlsContainer: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginTop: 0 },
  playButton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  controlBtn: { padding: 12 },
  bottomCapsuleContainer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bottomCapsule: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 4, borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  capsuleButton: { padding: 6, alignItems: 'center', justifyContent: 'center' },
  capsuleDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  libraryModal: { width: '100%', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 4, color: '#FFF' },
  sectionHeader: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '900', letterSpacing: 3, marginTop: 25, marginBottom: 15 },
  albumGrid: { paddingBottom: 100 },
  albumGridInner: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  albumCard: { width: '48%', aspectRatio: 1, marginBottom: 15, borderRadius: 20, overflow: 'hidden' },
  albumCardInner: { flex: 1, padding: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  albumIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  albumCardTitle: { color: '#FFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  albumCardTitleDownload: { color: '#03C988', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  albumCardCount: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 4 },
  libraryItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  libIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  libraryFileName: { color: '#FFF', fontSize: 15 },
  libraryDetail: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 4 },
  emptyContainer: { flex: 1, width: '100%', padding: 40, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 30, fontSize: 14, lineHeight: 20 },
  emptyButton: { paddingHorizontal: 25, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)' },
  emptyButtonText: { color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  infoModalBackdrop: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  infoModal: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  infoContent: { alignItems: 'center', padding: 40 },
  infoVersion: { fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: 2, marginBottom: 5 },
  infoTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 10, color: '#FFF', marginBottom: 40 },
  infoFeatureBox: { marginBottom: 50, alignItems: 'flex-start', width: '100%' },
  infoFeatureText: { color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: 2, marginBottom: 15, fontWeight: '600' },
  githubLink: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  githubText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginLeft: 10 },
  closeInfoBtn: { marginTop: 60, padding: 15 },
  closeInfoText: { color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: '900', letterSpacing: 4 }
});

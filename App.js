import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, FlatList, Modal, Image, Platform, StatusBar, ActivityIndicator, Linking, Pressable, SafeAreaView, Alert, PermissionsAndroid } from 'react-native';
import * as EuphoricAudio from './modules/euphoric-audio';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { getColors } from 'react-native-image-colors';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState('No Track Selected');
  const [artistName, setArtistName] = useState('Bit-Perfect Audio');
  const [artworkUri, setArtworkUri] = useState(null);
  const [accentColor, setAccentColor] = useState('#B22222');
  const [fileMeta, setFileMeta] = useState({ size: '0 MB', ext: '---' });
  
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isScanning, setIsScanning] = useState(false);
  
  const timerRef = useRef(null);

  useEffect(() => {
    // Initial scan with delay to allow UI to settle
    const timer = setTimeout(() => scanLibrary(), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        const status = EuphoricAudio.getStatus();
        setPosition(status.position);
        setDuration(status.duration);
        setSampleRate(status.sampleRate);
        if (status.duration > 0 && status.position >= status.duration - 0.5) playNext();
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, currentIndex, libraryFiles]);

  useEffect(() => {
    const fetchColors = async () => {
      if (artworkUri) {
        try {
          const result = await getColors(artworkUri, {
            fallback: '#B22222',
            cache: true,
            key: artworkUri,
          });
          
          if (Platform.OS === 'android') {
            setAccentColor(result.vibrant || result.dominant || '#B22222');
          } else if (Platform.OS === 'ios') {
            setAccentColor(result.primary || result.secondary || '#B22222');
          } else {
            setAccentColor(result.dominant || '#B22222');
          }
        } catch (error) {
          console.error("Color extraction error:", error);
          setAccentColor('#B22222');
        }
      } else {
        setAccentColor('#B22222');
      }
    };
    fetchColors();
  }, [artworkUri]);

  const togglePlayback = () => {
    if (isPlaying) EuphoricAudio.stopAudio();
    else EuphoricAudio.startAudio();
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value) => {
    EuphoricAudio.seekTo(value);
    setPosition(value);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const loadTrack = async (item, index) => {
    try {
      setIsScanning(true);
      let finalUri = item.uri;

      // Ensure C++ can read it
      if (finalUri.startsWith('content://')) {
        const cachePath = `${FileSystem.cacheDirectory}${item.filename || item.name || 'temp_audio'}`;
        await FileSystem.copyAsync({ from: finalUri, to: cachePath });
        finalUri = cachePath;
      }

      const success = EuphoricAudio.loadAudio(finalUri);
      if (success) {
        setTrackName(item.filename || item.name || 'Unknown');
        setArtistName('Bit-Perfect Stream');
        setCurrentIndex(index);
        const ext = (item.filename || item.name || '').split('.').pop()?.toUpperCase() || '---';
        const info = await FileSystem.getInfoAsync(finalUri);
        if (info.exists) {
          setFileMeta({ size: `${(info.size / (1024 * 1024)).toFixed(1)} MB`, ext });
        }
        
        // Use Native extractor for artwork
        const base64Art = await EuphoricAudio.getArtwork(finalUri);
        console.log("Artwork extraction result:", base64Art ? "Found (Base64)" : "Not found");
        setArtworkUri(base64Art);

        EuphoricAudio.startAudio();
        setIsPlaying(true);
        setShowLibrary(false);
      } else {
        Alert.alert("Engine Error", "This file format is not supported yet.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Load Error", e.message);
    }
    setIsScanning(false);
  };

  const playNext = () => {
    if (libraryFiles.length > 0 && currentIndex < libraryFiles.length - 1) {
      loadTrack(libraryFiles[currentIndex + 1], currentIndex + 1);
    }
  };

  const playPrev = () => {
    if (libraryFiles.length > 0 && currentIndex > 0) {
      loadTrack(libraryFiles[currentIndex - 1], currentIndex - 1);
    } else {
      EuphoricAudio.seekTo(0);
      setPosition(0);
    }
  };

  const requestAudioPermissions = async () => {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          'android.permission.READ_MEDIA_AUDIO'
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  };

  const scanLibrary = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      console.log("Starting library scan...");
      const hasPermission = await requestAudioPermissions();
      
      if (!hasPermission) {
        console.log("Permission denied via direct request");
        setIsScanning(false);
        return;
      }

      // Explicitly ask MediaLibrary too, as it has its own internal check
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log("MediaLibrary permission denied");
        setIsScanning(false);
        return;
      }

      console.log("Fetching audio assets...");
      const media = await MediaLibrary.getAssetsAsync({ 
        mediaType: 'audio', 
        first: 1000,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]]
      });
      
      console.log(`Successfully found ${media.assets.length} audio tracks`);
      setLibraryFiles(media.assets);
    } catch (e) {
      console.error("Scan error:", e);
    }
    setIsScanning(false);
  };

  const scanFolderManually = async () => {
    setIsScanning(true);
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(permissions.directoryUri);
        const audioFiles = files
          .filter(f => f.toLowerCase().endsWith('.mp3') || f.toLowerCase().endsWith('.wav') || f.toLowerCase().endsWith('.flac'))
          .map(f => ({
            uri: f,
            name: decodeURIComponent(f.split('%2F').pop()),
            filename: decodeURIComponent(f.split('%2F').pop())
          }));
        setLibraryFiles(audioFiles);
        setShowLibrary(true);
      }
    } catch (e) { Alert.alert("Folder Error", e.message); }
    setIsScanning(false);
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
      if (!result.canceled) loadTrack(result.assets[0], -1);
    } catch (err) { console.error(err); }
  };

  return (
    <View style={styles.container}>
      {/* Increased spacing for Notch/Status Bar */}
      <View style={styles.statusBarSafe} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setShowLibrary(true)} style={styles.headerButton} hitSlop={20}>
          <Ionicons name="library" size={26} color={accentColor} />
        </TouchableOpacity>
        
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: accentColor }]}>EUPHORIC</Text>
          {isScanning && <ActivityIndicator size="small" color={accentColor} style={{marginLeft: 10}} />}
        </View>
        
        <TouchableOpacity onPress={pickDocument} style={styles.headerButton} hitSlop={20}>
          <Ionicons name="add" size={28} color={accentColor} />
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.albumArtContainer}>
          <View style={[styles.albumArtShadow, { shadowColor: accentColor }]}>
            {artworkUri ? (
              <Image source={{ uri: artworkUri }} style={styles.albumArt} resizeMode="cover" />
            ) : (
              <View style={styles.albumArtPlaceholder}>
                <Ionicons name="musical-notes" size={100} color="#111" />
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.infoContainer}>
          <Text style={styles.trackName} numberOfLines={1}>{trackName}</Text>
          <Text style={styles.artistName}>{artistName}</Text>
        </View>

        <View style={styles.glassContainer}>
          <View style={styles.metadataRow}>
            <View style={styles.metaItem}><Text style={styles.metadataLabel}>FORMAT</Text><Text style={[styles.metadataValue, { color: accentColor }]}>{fileMeta.ext}</Text></View>
            <View style={styles.metaItem}><Text style={styles.metadataLabel}>QUALITY</Text><Text style={[styles.metadataValue, { color: accentColor }]}>{sampleRate > 0 ? `${sampleRate/1000}kHz` : '---'}</Text></View>
            <View style={styles.metaItem}><Text style={styles.metadataLabel}>SIZE</Text><Text style={[styles.metadataValue, { color: accentColor }]}>{fileMeta.size}</Text></View>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration || 1}
            value={position}
            onSlidingComplete={handleSeek}
            minimumTrackTintColor={accentColor}
            maximumTrackTintColor="#1a1a1a"
            thumbTintColor={accentColor}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        <View style={styles.controlsContainer}>
          <TouchableOpacity onPress={playPrev} style={styles.controlBtn}><Ionicons name="play-skip-back-sharp" size={36} color="#FFF" /></TouchableOpacity>
          <TouchableOpacity style={[styles.playButton, { backgroundColor: accentColor }]} onPress={togglePlayback}>
            <Ionicons name={isPlaying ? "pause" : "play"} size={42} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity onPress={playNext} style={styles.controlBtn}><Ionicons name="play-skip-forward-sharp" size={36} color="#FFF" /></TouchableOpacity>
        </View>
        <View style={{height: 20}} />
      </View>

      <Modal visible={showLibrary} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.libraryModal}>
            <View style={{ height: 20 }} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: accentColor }]}>ALL MUSIC</Text>
              <TouchableOpacity onPress={() => setShowLibrary(false)} hitSlop={20}>
                <Ionicons name="chevron-down" size={36} color={accentColor} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={libraryFiles}
              keyExtractor={(item, index) => index.toString()}
              contentContainerStyle={{paddingBottom: 40}}
              renderItem={({ item, index }) => (
                <TouchableOpacity style={styles.libraryItem} onPress={() => loadTrack(item, index)}>
                  <View style={[styles.libIconBox, index === currentIndex && { backgroundColor: accentColor, borderColor: accentColor }]}>
                    <Ionicons name="musical-note" size={20} color={index === currentIndex ? "#000" : "#333"} />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={[styles.libraryFileName, index === currentIndex && {color: accentColor}]} numberOfLines={1}>{item.filename || item.name}</Text>
                    <Text style={styles.libraryDetail}>{item.duration ? formatTime(item.duration) : 'Local File'}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{isScanning ? "Scanning device..." : "No audio found automatically"}</Text>
                  <TouchableOpacity style={[styles.refreshBtn, { backgroundColor: accentColor + '1A', borderColor: accentColor }]} onPress={scanFolderManually}>
                    <Text style={[styles.refreshBtnText, { color: accentColor }]}>SELECT MUSIC FOLDER</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.refreshBtn, {marginTop: 10, backgroundColor: 'transparent', borderColor: accentColor}]} onPress={scanLibrary}>
                    <Text style={[styles.refreshBtnText, { color: accentColor }]}>RETRY SCAN</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      <ExpoStatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  statusBarSafe: { height: Platform.OS === 'android' ? StatusBar.currentHeight + 30 : 60, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, height: 60, backgroundColor: '#000' },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', borderRadius: 24, borderWidth: 1, borderColor: '#111' },
  titleContainer: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '900', letterSpacing: 5 },
  mainContent: { flex: 1, paddingHorizontal: 25, justifyContent: 'space-between', paddingBottom: 20 },
  albumArtContainer: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  albumArtShadow: { width: width * 0.78, height: width * 0.78, borderRadius: 28, backgroundColor: '#050505', shadowRadius: 25, elevation: 20, borderWidth: 1, borderColor: '#111', overflow: 'hidden' },
  albumArt: { width: '100%', height: '100%' },
  albumArtPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  infoContainer: { marginTop: 10 },
  trackName: { fontSize: 26, fontWeight: 'bold', color: '#FFF' },
  artistName: { fontSize: 16, color: '#666', marginTop: 4 },
  glassContainer: { marginTop: 20, padding: 20, borderRadius: 24, backgroundColor: '#080808', borderWidth: 1, borderColor: '#151515' },
  metadataRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metadataLabel: { color: '#333', fontSize: 9, fontWeight: 'bold', letterSpacing: 1, marginBottom: 4 },
  metadataValue: { fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold' },
  progressContainer: { marginTop: 20 },
  slider: { width: '100%', height: 40 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 },
  timeText: { color: '#444', fontSize: 12, fontFamily: 'monospace' },
  controlsContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingHorizontal: 10 },
  playButton: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', elevation: 10 },
  controlBtn: { padding: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'flex-end' },
  libraryModal: { height: height * 0.88, width: '100%', backgroundColor: '#050505', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 25, borderWidth: 1, borderColor: '#111' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  modalTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 4 },
  libraryItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#111' },
  libIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', marginRight: 15, borderWidth: 1, borderColor: '#111' },
  activeLibIcon: { },
  libraryFileName: { color: '#EEE', fontSize: 16, fontWeight: '500' },
  libraryDetail: { color: '#444', fontSize: 12, marginTop: 4 },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#333', textAlign: 'center', marginBottom: 20 },
  refreshBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  refreshBtnText: { fontWeight: 'bold', fontSize: 12 }
});


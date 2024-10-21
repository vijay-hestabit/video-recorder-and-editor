import axios from 'axios';
import React, { useState, useRef, useEffect } from 'react';

const VideoRecorder = () => {
    const [recording, setRecording] = useState(false);
    const [paused, setPaused] = useState(false);
    const [videoUrl, setVideoUrl] = useState('');
    const mediaRecorderRef = useRef(null);
    const videoRef = useRef(null);
    const webcamRef = useRef(null);
    const chunks = useRef([]);
    const [recordingTime, setRecordingTime] = useState(0);
    const recordingIntervalRef = useRef(null);
    const [showSettings, setShowSettings] = useState(false);
    const [useWebcam, setUseWebcam] = useState(true);
    const [useMic, setUseMic] = useState(true);
    const [showPreview, setShowPreview] = useState(false);
    const [videos, setVideos] = useState([]);
    const [videoTitle, setVideoTitle] = useState("");
    const [microphoneDevices, setMicrophoneDevices] = useState([]);
    const [selectedMicrophone, setSelectedMicrophone] = useState(null);
    const [showMicrophoneMenu, setShowMicrophoneMenu] = useState(false);
    const [screenSharingStream, setScreenSharingStream] = useState(null);
    const [webcamStream, setWebcamStream] = useState(null);

    const fetchVideos = async () => {
        try {
            const response = await axios.get('http://localhost:5000/api/videos');
            setVideos(response.data);
            if (response.data.length > 0) {
                setVideoUrl(`http://localhost:5000/${response.data[0]?.filePath}`);
                setVideoTitle(response.data[0]?.title);
            }
        } catch (error) {
            console.error("Error fetching videos:", error);
        }
    };

    useEffect(() => {
        fetchVideos();
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const mics = devices.filter(device => device.kind === 'audioinput');
            setMicrophoneDevices(mics);
            if (mics.length > 0) {
                setSelectedMicrophone(mics[0]);
            }
        });
    }, []);

    const startRecording = async () => {
        setShowSettings(false);
        setShowPreview(true);
        try {
            let audioStream = null;
            if (useMic && selectedMicrophone) {
                try {
                    audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: { deviceId: { exact: selectedMicrophone.deviceId } }
                    });
                } catch (error) {
                    console.warn("Failed to access selected microphone, falling back to default.", error);
                    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                }
            }

            let combinedStream = null;

            if (useWebcam) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                setWebcamStream(stream);
                combinedStream = new MediaStream([
                    ...stream.getTracks(),
                    ...(audioStream ? audioStream.getAudioTracks() : []),
                    ...(screenSharingStream ? screenSharingStream.getTracks() : []),
                ]);
            } else {
                combinedStream = new MediaStream([
                    ...(audioStream ? audioStream.getAudioTracks() : []),
                    ...(screenSharingStream ? screenSharingStream.getTracks() : []),
                ]);
            }

            if (videoRef.current) {
                videoRef.current.srcObject = combinedStream;
            }

            const mediaRecorder = new MediaRecorder(combinedStream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoUrl(url);
                chunks.current = [];
                await uploadVideo(blob);
                await fetchVideos();
                // Stop screen sharing if active
                if (screenSharingStream) {
                    screenSharingStream.getTracks().forEach(track => track.stop());
                    setScreenSharingStream(null);
                }
                // Stop webcam if active
                if (webcamStream) {
                    webcamStream.getTracks().forEach(track => track.stop());
                    setWebcamStream(null);
                }
            };

            mediaRecorder.start();
            setRecording(true);
            setPaused(false);
            setRecordingTime(0);
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error("Error accessing media devices:", error);
            alert("Error accessing media devices: " + error.message);
        }
    };

    const startScreenSharing = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always"
                },
                audio: false // No audio from screen sharing by default
            });
            setScreenSharingStream(stream);
            // Add the new screen sharing tracks to the existing media stream
            if (videoRef.current.srcObject) {
                const currentStream = videoRef.current.srcObject;
                stream.getTracks().forEach(track => {
                    currentStream.addTrack(track);
                });
            }
        } catch (error) {
            console.error("Error starting screen sharing:", error);
            alert("Error starting screen sharing: " + error.message);
        }
    };

    const stopScreenSharing = () => {
        if (screenSharingStream) {
            screenSharingStream.getTracks().forEach(track => track.stop());
            setScreenSharingStream(null);
        }
    };

    const stopWebcam = () => {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            setWebcamStream(null);
        }
        setUseWebcam(false); // Update state to reflect webcam is stopped
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.pause();
            setPaused(true);
            clearInterval(recordingIntervalRef.current);
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
            mediaRecorderRef.current.resume();
            setPaused(false);
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
        }
        const tracks = videoRef.current?.srcObject?.getTracks();
        tracks?.forEach(track => track.stop());

        setRecording(false);
        setPaused(false);
        clearInterval(recordingIntervalRef.current);
        setShowPreview(false);
        stopScreenSharing(); // Stop screen sharing when recording stops
        stopWebcam(); // Stop webcam when recording stops
    };

    const onPlay = (video) => {
        setVideoUrl(`http://localhost:5000/${video.filePath}`);
        setVideoTitle(video.title);
    };

    const uploadVideo = async (videoBlob) => {
        const formData = new FormData();
        formData.append('video', videoBlob, `recording_${Date.now()}.webm`);

        try {
            const response = await axios.post('http://localhost:5000/api/videos/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            console.log(response.data.message);
        } catch (error) {
            console.error("Error uploading video:", error);
        }
    };

    useEffect(() => {
        if (!recording) {
            setRecordingTime(0);
        }
    }, [recording]);

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes < 10 ? '0' : ''}${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const toggleMicrophoneMenu = () => {
        setShowMicrophoneMenu(!showMicrophoneMenu);
    };

    const selectMicrophone = (device) => {
        setSelectedMicrophone(device);
        setShowMicrophoneMenu(false);
    };

    useEffect(() => {
        if (recording) {
            document.title = `${formatTime(recordingTime)} || Recording`;
        } else {
            document.title = "Video Recorder";
        }
        return () => {
            document.title = "Video Recorder";
        };
    }, [recordingTime, recording]);

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <header className="bg-white shadow-lg p-3 flex justify-between items-center">
                <h1 className="text-2xl font-bold">Video Recorder</h1>
                {recording ? (
                    <div className="flex items-center">
                        <span className="mr-4 text-xl">{formatTime(recordingTime)}</span>
                        {paused ? (
                            <button onClick={resumeRecording} className="bg-green-500 text-white px-6 py-2 rounded-lg shadow-md hover:bg-green-600 transition">
                                Resume
                            </button>
                        ) : (
                            <button onClick={pauseRecording} className="bg-yellow-500 text-white px-6 py-2 rounded-lg shadow-md hover:bg-yellow-600 transition">
                                Pause
                            </button>
                        )}
                        <button onClick={stopRecording} className="bg-red-500 text-white px-6 py-2 rounded-lg shadow-md hover:bg-red-600 transition ml-4">
                            Stop
                        </button>
                    </div>
                ) : (
                    <button onClick={() => setShowSettings(true)} className="bg-blue-500 text-white px-6 py-2 rounded-lg shadow-md hover:bg-blue-600 transition">
                        Record Video
                    </button>
                )}
            </header>

            <div className="flex flex-grow overflow-hidden">
                <main className="flex-grow p-4 relative overflow-hidden">
                    {showPreview && (
                        <div className="relative mb-6">
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                className="w-full h-auto max-h-[80vh] border border-gray-300 rounded-lg shadow-md"
                                controls
                            />
                            {useWebcam && (
                                <video
                                    ref={webcamRef}
                                    autoPlay
                                    muted
                                    className="absolute w-32 h-32 rounded-full border-2 border-blue-400 shadow-lg bottom-4 right-4"
                                />
                            )}
                        </div>
                    )}

                    {showSettings && (
                        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[2]">
                            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
                                <h2 className="text-xl font-semibold mb-4">Recording Settings</h2>
                                <label className="block mb-3">
                                    <input type="checkbox" checked={useWebcam} onChange={() => setUseWebcam(!useWebcam)} className="mr-2" />
                                    Use Webcam
                                </label>
                                <label className="block mb-3">
                                    <input type="checkbox" checked={useMic} onChange={() => setUseMic(!useMic)} className="mr-2" />
                                    Use Microphone
                                </label>
                                {useMic && (
                                    <div className="mb-3">
                                        <button onClick={toggleMicrophoneMenu} className="bg-purple-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-purple-600 transition">
                                            {selectedMicrophone ? selectedMicrophone.label : "Select Microphone"}
                                        </button>
                                        {showMicrophoneMenu && (
                                            <div className="mt-2 bg-white border border-gray-300 rounded-lg shadow-lg">
                                                {microphoneDevices.map((device) => (
                                                    <div
                                                        key={device.deviceId}
                                                        className="p-2 hover:bg-gray-100 cursor-pointer"
                                                        onClick={() => selectMicrophone(device)}
                                                    >
                                                        {device.label || `Microphone ${device.deviceId}`}
                                                        {selectedMicrophone && selectedMicrophone.deviceId === device.deviceId && " ✓"}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex justify-end space-x-4">
                                    <button onClick={startRecording} className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-600 transition">
                                        Start Recording
                                    </button>
                                    <button onClick={() => setShowSettings(false)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-md hover:bg-gray-300 transition">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {videoUrl && !showPreview && (
                        <div>
                            <h3 className="text-lg font-semibold mb-2">{videoTitle}</h3>
                            <video
                                src={videoUrl}
                                controls
                                className="w-full h-auto max-h-[80vh] border border-gray-300 rounded-lg shadow-md"
                            />
                        </div>
                    )}
                </main>

                <aside className="w-64 border-l border-gray-300 bg-white overflow-y-auto">
                    <h2 className="text-lg font-semibold p-4">Recorded Videos</h2>
                    <div className="p-4 space-y-4">
                        {videos.map((video, index) => (
                            <div
                                key={index}
                                className="p-4 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                                onClick={() => onPlay(video)}
                            >
                                <h3 className="font-semibold">{video.title}</h3>
                                <p className="text-gray-500 text-sm">Click to play</p>
                            </div>
                        ))}
                    </div>
                </aside>
            </div>

            <footer className="bg-white shadow-lg p-3 text-center">
                <p className="text-gray-600">© 2024 Video Recorder App</p>
            </footer>

            {recording && (
                <div className="fixed bottom-5 right-5">
                    {screenSharingStream ? (
                        <button onClick={stopScreenSharing} className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-red-600 transition">
                            Stop Sharing
                        </button>
                    ) : (
                        <button onClick={startScreenSharing} className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-green-600 transition">
                            Share Screen
                        </button>
                    )}
                </div>
            )}

            {useWebcam && (
                <div className="fixed bottom-20 right-5">
                    <button onClick={stopWebcam} className="bg-orange-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-orange-600 transition">
                        Stop Camera
                    </button>
                </div>
            )}
        </div>
    );
};

export default VideoRecorder;

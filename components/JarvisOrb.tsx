// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type Anthropic from '@anthropic-ai/sdk'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking'

export default function JarvisOrb() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [transcript, setTranscript] = useState('')
  const [voiceEnabled, setVoiceEnabled] = useState(true)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [textInput, setTextInput] = useState('')

  useEffect(() => {
    synthRef.current = window.speechSynthesis
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !synthRef.current) return
    synthRef.current.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    // Prefer a British English voice
    const voices = synthRef.current.getVoices()
    const british = voices.find(v => v.lang === 'en-GB') ?? voices.find(v => v.lang.startsWith('en'))
    if (british) utterance.voice = british
    utterance.rate = 1.0
    utterance.pitch = 0.95
    utterance.onend = () => setOrbState('idle')
    setOrbState('speaking')
    synthRef.current.speak(utterance)
  }, [voiceEnabled])

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim()) return

    const userMessage: Message = { role: 'user', content: userText }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setOrbState('thinking')
    setTranscript('')

    // Build Anthropic message history
    const apiMessages: Anthropic.MessageParam[] = newMessages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!res.ok) throw new Error('API error')

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''

      // Add empty assistant message to fill as we stream
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break

          try {
            const event = JSON.parse(data)
            if (event.type === 'text') {
              assistantText += event.text
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantText }
                return updated
              })
            }
            if (event.type === 'tool_start') {
              setOrbState('thinking')
            }
          } catch {}
        }
      }

      setOrbState('idle')
      if (assistantText) speak(assistantText)
    } catch {
      setOrbState('idle')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    }
  }, [messages, speak])

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice recognition is not supported in this browser. Try Chrome.')
      return
    }

    const SpeechRecognitionAPI = (window as Window & typeof globalThis & { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition ?? window.SpeechRecognition
    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'en-GB'
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => setOrbState('listening')
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const interim = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('')
      setTranscript(interim)
    }
    recognition.onend = () => {
      const final = transcript || ''
      if (final.trim()) sendMessage(final)
      else setOrbState('idle')
    }
    recognition.onerror = () => setOrbState('idle')

    recognitionRef.current = recognition
    recognition.start()
  }, [transcript, sendMessage])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const handleMicClick = () => {
    if (orbState === 'listening') stopListening()
    else startListening()
  }

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(textInput)
    setTextInput('')
  }

  const orbColor = {
    idle: 'bg-gray-900',
    listening: 'bg-blue-500',
    thinking: 'bg-amber-500',
    speaking: 'bg-emerald-500',
  }[orbState]

  const orbPulse = orbState !== 'idle'

  return (
    <>
      {/* Floating orb button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {/* Transcript bubble */}
        {transcript && (
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2 text-sm text-gray-700 shadow-lg max-w-xs">
            {transcript}
          </div>
        )}

        {/* Chat panel */}
        {open && (
          <div className="w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ height: '520px' }}>
            {/* Header */}
            <div className="px-4 py-3 bg-gray-900 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full ${orbColor} ${orbPulse ? 'animate-pulse' : ''}`} />
                <span className="text-white text-sm font-medium tracking-wide">JARVIS</span>
                <span className="text-gray-400 text-xs">
                  {orbState === 'idle' ? 'Online' :
                   orbState === 'listening' ? 'Listening...' :
                   orbState === 'thinking' ? 'Thinking...' : 'Speaking...'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVoiceEnabled(v => !v)}
                  className={`text-xs px-2 py-0.5 rounded ${voiceEnabled ? 'text-emerald-400' : 'text-gray-500'}`}
                  title={voiceEnabled ? 'Mute voice' : 'Unmute voice'}
                >
                  {voiceEnabled ? '🔊' : '🔇'}
                </button>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.length === 0 && (
                <div className="text-center text-sm text-gray-400 mt-8">
                  <p className="text-2xl mb-2">◉</p>
                  <p>Good day. How may I assist you?</p>
                  <p className="text-xs mt-1 text-gray-300">Try: "What's on my calendar?" or "Any new emails?"</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-gray-900 text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {m.content || <span className="inline-block w-4 h-1 bg-gray-300 rounded animate-pulse" />}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 p-3 bg-white">
              <form onSubmit={handleTextSubmit} className="flex gap-2">
                <input
                  ref={inputRef}
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400"
                  disabled={orbState === 'thinking'}
                />
                <button
                  type="button"
                  onClick={handleMicClick}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-base transition-colors ${
                    orbState === 'listening'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={orbState === 'listening' ? 'Stop listening' : 'Start voice input'}
                >
                  🎤
                </button>
                <button
                  type="submit"
                  disabled={!textInput.trim() || orbState === 'thinking'}
                  className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center disabled:opacity-40 hover:bg-gray-700 transition-colors"
                >
                  ↑
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Orb toggle */}
        <button
          onClick={() => {
            setOpen(o => !o)
            if (!open) startListening()
          }}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${orbColor} ${orbPulse ? 'animate-pulse' : ''} hover:scale-110 active:scale-95`}
          title="Open JARVIS"
        >
          <span className="text-white text-xl">◉</span>
        </button>
      </div>
    </>
  )
}

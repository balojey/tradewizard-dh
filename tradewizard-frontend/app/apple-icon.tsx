import { ImageResponse } from 'next/og'

// Route segment config
export const runtime = 'edge'

// Image metadata
export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

// Image generation
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 100,
          background: 'linear-gradient(135deg, #111827 0%, #000000 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#818cf8',
          fontWeight: 900,
          fontFamily: 'system-ui, sans-serif',
          borderRadius: '20px',
          border: '2px solid rgba(255,255,255,0.1)',
        }}
      >
        T
      </div>
    ),
    {
      ...size,
    }
  )
}
import { useEffect, useState } from 'react'
import './App.css'

const weatherLabels = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Light rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function App() {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState(null)
  const [current, setCurrent] = useState(null)
  const [forecast, setForecast] = useState([])
  const [expandedDay, setExpandedDay] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])

  const fetchLocationSuggestions = async (search, signal) => {
    if (!search) {
      setSuggestions([])
      return
    }

    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          search,
        )}&count=5`,
        { signal },
      )
      const geoData = await geoRes.json()

      if (!geoData.results || geoData.results.length === 0) {
        setSuggestions([])
        return
      }

      setSuggestions(
        geoData.results.map(({ name, country, admin1, latitude, longitude }) => ({
          label: `${name}${admin1 ? `, ${admin1}` : ''}, ${country}`,
          latitude,
          longitude,
          name,
          country,
          admin1,
        })),
      )
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSuggestions([])
      }
    }
  }

  const reverseGeocode = async (latitude, longitude) => {
    try {
      const reverseRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&accept-language=en`,
      )
      const reverseData = await reverseRes.json()

      if (!reverseData || !reverseData.address) {
        return null
      }

      const address = reverseData.address
      const place =
        address.city || address.town || address.village || address.hamlet ||
        address.county || address.state || address.region || address.country

      if (!place) {
        return null
      }

      const region = address.state || address.region || address.county
      const country = address.country
      const placeLabel = `${place}${region && place !== region ? `, ${region}` : ''}${country ? `, ${country}` : ''}`
      return placeLabel
    } catch {
      return null
    }
  }

  const searchWeatherByCoords = async ({ latitude, longitude, name, country, admin1, label }) => {
    if (latitude == null || longitude == null) return
    setError('')
    setLoading(true)
    setSuggestions([])

    try {
      const locationLabel =
        label || `${name ? name : 'Current location'}${admin1 ? `, ${admin1}` : ''}${country ? `, ${country}` : ''}`
      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`,
      )
      const forecastData = await forecastRes.json()

      if (!forecastData.current_weather || !forecastData.daily) {
        throw new Error('Weather service returned incomplete data.')
      }

      setLocation(locationLabel)
      setCurrent({
        temperature: forecastData.current_weather.temperature,
        windSpeed: forecastData.current_weather.windspeed,
        windDirection: forecastData.current_weather.winddirection,
        condition: weatherLabels[forecastData.current_weather.weathercode] ||
          'Unknown',
        time: forecastData.current_weather.time,
        sunrise: forecastData.daily.sunrise[0],
        sunset: forecastData.daily.sunset[0],
        min: forecastData.daily.temperature_2m_min[0],
        max: forecastData.daily.temperature_2m_max[0],
      })

      const dailyForecast = forecastData.daily.time.map((date, index) => ({
        date,
        min: forecastData.daily.temperature_2m_min[index],
        max: forecastData.daily.temperature_2m_max[index],
        condition:
          weatherLabels[forecastData.daily.weathercode[index]] || 'Unknown',
        sunrise: forecastData.daily.sunrise[index],
        sunset: forecastData.daily.sunset[index],
      }))

      setForecast(dailyForecast.slice(0, 6))
      setExpandedDay(null)
    } catch (err) {
      setError(err.message || 'Unable to fetch weather. Please try again.')
      setLocation(null)
      setCurrent(null)
      setForecast([])
    } finally {
      setLoading(false)
    }
  }

  const searchWeather = async (search) => {
    if (!search) return
    setError('')
    setLoading(true)
    setSuggestions([])

    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          search,
        )}&count=5`,
      )
      const geoData = await geoRes.json()

      if (!geoData.results || geoData.results.length === 0) {
        throw new Error('Location not found. Try another city or place.')
      }

      const bestMatch = geoData.results[0]
      const { latitude, longitude, name, country, admin1 } = bestMatch
      const locationLabel = `${name}${admin1 ? `, ${admin1}` : ''}, ${country}`

      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`,
      )
      const forecastData = await forecastRes.json()

      if (!forecastData.current_weather || !forecastData.daily) {
        throw new Error('Weather service returned incomplete data.')
      }

      setLocation(locationLabel)
      setCurrent({
        temperature: forecastData.current_weather.temperature,
        windSpeed: forecastData.current_weather.windspeed,
        windDirection: forecastData.current_weather.winddirection,
        condition: weatherLabels[forecastData.current_weather.weathercode] ||
          'Unknown',
        time: forecastData.current_weather.time,
        sunrise: forecastData.daily.sunrise[0],
        sunset: forecastData.daily.sunset[0],
        min: forecastData.daily.temperature_2m_min[0],
        max: forecastData.daily.temperature_2m_max[0],
      })

      const dailyForecast = forecastData.daily.time.map((date, index) => ({
        date,
        min: forecastData.daily.temperature_2m_min[index],
        max: forecastData.daily.temperature_2m_max[index],
        condition:
          weatherLabels[forecastData.daily.weathercode[index]] || 'Unknown',
        sunrise: forecastData.daily.sunrise[index],
        sunset: forecastData.daily.sunset[index],
      }))

      setForecast(dailyForecast.slice(0, 6))
      setExpandedDay(null)
    } catch (err) {
      setError(err.message || 'Unable to fetch weather. Please try again.')
      setLocation(null)
      setCurrent(null)
      setForecast([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      searchWeather(query)
      return
    }

    const handleSuccess = ({ coords }) => {
      const fetchCurrentWeather = async () => {
        const label = await reverseGeocode(coords.latitude, coords.longitude)
        if (label) {
          setQuery(label)
        }
        searchWeatherByCoords({
          latitude: coords.latitude,
          longitude: coords.longitude,
          label,
        })
      }

      fetchCurrentWeather()
    }

    const handleError = () => {
      searchWeather(query)
    }

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 300000,
    })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      fetchLocationSuggestions(query, controller.signal)
    }, 300)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [query])

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <p className="eyebrow">Weather Forecast</p>
          <h1>Search any location for live weather</h1>
        </div>
        <div className="search-panel">
          <label htmlFor="search">Search location</label>
          <div className="search-input-row">
            <input
              id="search"
              type="search"
              value={query}
              placeholder="Enter city, town, or region"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  searchWeather(query)
                }
              }}
              aria-autocomplete="list"
              aria-controls="location-suggestions"
            />
            <button type="button" onClick={() => searchWeather(query)}>
              Search
            </button>
          </div>
          {suggestions.length > 0 && (
            <ul id="location-suggestions" className="suggestion-list" role="listbox">
              {suggestions.map((item) => (
                <li
                  key={item.label}
                  className="suggestion-item"
                  role="option"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    setQuery(item.label)
                    searchWeatherByCoords(item)
                  }}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {error && <div className="alert">{error}</div>}
      {loading && <div className="alert info">Loading weather…</div>}

      {current && (
        <section className="current-weather-card">
          <div className="current-header">
            <div>
              <p className="location-label">{location}</p>
              <h2>{current.condition}</h2>
              <p className="weather-time">
                Updated at {new Date(current.time).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div className="current-temperature">
              <span>{Math.round(current.temperature)}°</span>
              <small>°C</small>
            </div>
          </div>

          <div className="current-range">
            <span>Today: {Math.round(current.min)}° / {Math.round(current.max)}°</span>
          </div>

          <div className="weather-details">
            <div>
              <span>Wind</span>
              <strong>{Math.round(current.windSpeed)} km/h</strong>
            </div>
            <div>
              <span>Direction</span>
              <strong>{Math.round(current.windDirection)}°</strong>
            </div>
            <div>
              <span>Sunrise</span>
              <strong>{new Date(current.sunrise).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}</strong>
            </div>
            <div>
              <span>Sunset</span>
              <strong>{new Date(current.sunset).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}</strong>
            </div>
          </div>
        </section>
      )}

      {forecast.length > 0 && (
        <section className="forecast-section">
          <div className="section-heading">
            <h2>6-day forecast</h2>
            <p>Temperature highs, lows, and conditions ahead.</p>
          </div>
          <div className="forecast-grid">
            {forecast.map((day) => {
              const expanded = expandedDay === day.date
              return (
                <article
                  key={day.date}
                  className={`forecast-card ${expanded ? 'expanded' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedDay(expanded ? null : day.date)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setExpandedDay(expanded ? null : day.date)
                    }
                  }}
                >
                  <div className="forecast-header">
                    <p className="forecast-day">{formatDate(day.date)}</p>
                    <p className="forecast-condition">{day.condition}</p>
                    <div className="forecast-temps">
                      <span className="high">{Math.round(day.max)}°</span>
                      <span className="low">{Math.round(day.min)}°</span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="forecast-expanded">
                      <div>
                        <span>Sunrise</span>
                        <strong>{new Date(day.sunrise).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}</strong>
                      </div>
                      <div>
                        <span>Sunset</span>
                        <strong>{new Date(day.sunset).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}</strong>
                      </div>
                      <div>
                        <span>Temperature range</span>
                        <strong>{Math.round(day.min)}° – {Math.round(day.max)}°</strong>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      <footer className="app-footer">
        Powered by Open-Meteo API · No API key needed
      </footer>
    </div>
  )
}

export default App

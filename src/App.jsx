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

function getCurrentHumidity(forecastData) {
  if (!forecastData.hourly?.time || !forecastData.hourly?.relativehumidity_2m || !forecastData.current_weather?.time) {
    return 0
  }

  const index = forecastData.hourly.time.findIndex(
    (time) => time === forecastData.current_weather.time,
  )

  return index >= 0 ? forecastData.hourly.relativehumidity_2m[index] : 0
}

function App() {
  const [query, setQuery] = useState('')
  const [suggestionTerm, setSuggestionTerm] = useState('')
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

    const fetchOpenMeteoResults = async (query) => {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          query,
        )}&count=5`,
        { signal },
      )
      const geoData = await geoRes.json()
      return geoData.results || []
    }

    const fetchNominatimResults = async (query) => {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          query,
        )}&format=jsonv2&limit=5&accept-language=en`,
        { signal },
      )
      const nomData = await nomRes.json()
      if (!Array.isArray(nomData)) {
        return []
      }
      return nomData.map((item) => {
        const address = item.address || {}
        const name = item.name || address.city || address.town || address.village || address.hamlet || address.county || address.state || address.country || item.display_name
        return {
          name,
          country: address.country || '',
          admin1: address.state || address.county || '',
          latitude: Number(item.lat),
          longitude: Number(item.lon),
          label: item.display_name,
        }
      })
    }

    const fetchGeoResults = async (query) => {
      const openMeteoResults = await fetchOpenMeteoResults(query)
      if (openMeteoResults.length > 0) {
        return openMeteoResults
      }
      return await fetchNominatimResults(query)
    }

    const buildFallbackQueries = (query) => {
      const cleaned = query.trim()
      const queries = []
      if (cleaned.includes(',')) {
        const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean)
        if (parts.length >= 2) {
          queries.push(parts.slice(0, 2).join(', '))
        }
        if (parts.length >= 1) {
          queries.push(parts[0])
        }
      }
      const words = cleaned.split(/\s+/).filter(Boolean)
      if (words.length > 1) {
        queries.push(words.slice(1).join(' '))
        queries.push(words.slice(0, words.length - 1).join(' '))
        queries.push(words[words.length - 1])
      }
      return Array.from(new Set(queries.filter(Boolean)))
    }

    try {
      let results = await fetchGeoResults(search)
      if (!results || results.length === 0) {
        for (const fallback of buildFallbackQueries(search)) {
          results = await fetchGeoResults(fallback)
          if (results && results.length > 0) {
            break
          }
        }
      }

      if (!results || results.length === 0) {
        setSuggestions([])
        return
      }

      setSuggestions(
        results.map(({ name, country, admin1, latitude, longitude, label }) => ({
          label: label || `${name}${admin1 ? `, ${admin1}` : ''}${country ? `, ${country}` : ''}`,
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
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=relativehumidity_2m&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset,relative_humidity_2m_max&timezone=auto`,
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
        humidity: getCurrentHumidity(forecastData),
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
        humidity: forecastData.daily.relative_humidity_2m_max[index] || 0,
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

    const fetchOpenMeteoResults = async (query) => {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          query,
        )}&count=5`,
      )
      const geoData = await geoRes.json()
      return geoData.results || []
    }

    const fetchNominatimResults = async (query) => {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          query,
        )}&format=jsonv2&limit=5&accept-language=en`,
      )
      const nomData = await nomRes.json()
      if (!Array.isArray(nomData)) {
        return []
      }
      return nomData.map((item) => {
        const address = item.address || {}
        const name = item.name || address.city || address.town || address.village || address.hamlet || address.county || address.state || address.country || item.display_name
        return {
          name,
          country: address.country || '',
          admin1: address.state || address.county || '',
          latitude: Number(item.lat),
          longitude: Number(item.lon),
          label: item.display_name,
        }
      })
    }

    const fetchGeoResults = async (query) => {
      const openMeteoResults = await fetchOpenMeteoResults(query)
      if (openMeteoResults.length > 0) {
        return openMeteoResults
      }
      return await fetchNominatimResults(query)
    }

    const buildFallbackQueries = (query) => {
      const cleaned = query.trim()
      const queries = []
      if (cleaned.includes(',')) {
        const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean)
        if (parts.length >= 2) {
          queries.push(parts.slice(0, 2).join(', '))
        }
        if (parts.length >= 1) {
          queries.push(parts[0])
        }
      }
      const words = cleaned.split(/\s+/).filter(Boolean)
      if (words.length > 1) {
        queries.push(words.slice(1).join(' '))
        queries.push(words.slice(0, words.length - 1).join(' '))
        queries.push(words[words.length - 1])
      }
      return Array.from(new Set(queries.filter(Boolean)))
    }

    try {
      let results = await fetchGeoResults(search)
      if (!results || results.length === 0) {
        for (const fallback of buildFallbackQueries(search)) {
          results = await fetchGeoResults(fallback)
          if (results && results.length > 0) {
            break
          }
        }
      }

      if (!results || results.length === 0) {
        throw new Error('Location not found. Try another city or place.')
      }

      const bestMatch = results[0]
      const { latitude, longitude, name, country, admin1, label } = bestMatch
      const locationLabel = label || `${name}${admin1 ? `, ${admin1}` : ''}${country ? `, ${country}` : ''}`

      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=relativehumidity_2m&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset,relative_humidity_2m_max&timezone=auto`,
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
        humidity: getCurrentHumidity(forecastData),
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
        humidity: forecastData.daily.relative_humidity_2m_max[index] || 0,
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
      if (suggestionTerm.trim().length > 0) {
        fetchLocationSuggestions(suggestionTerm, controller.signal)
      } else {
        setSuggestions([])
      }
    }, 300)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [suggestionTerm])

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <p className="eyebrow">Nimbus</p>
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
              onChange={(event) => {
                setQuery(event.target.value)
                setSuggestionTerm(event.target.value)
              }}
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
                    setSuggestionTerm('')
                    setSuggestions([])
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
              <span>Humidity</span>
              <strong>{Math.round(current.humidity)}%</strong>
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
                      <div>
                        <span>Humidity</span>
                        <strong>{Math.round(day.humidity)}%</strong>
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

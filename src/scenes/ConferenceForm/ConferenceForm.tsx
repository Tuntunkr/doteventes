import 'react-datepicker/dist/react-datepicker.css'
import algoliasearch from 'algoliasearch'
import classNames from 'classnames'
import { sortBy } from 'lodash'
import { useState, useRef, ChangeEvent } from 'react'
import DatePicker from 'react-datepicker'
import { Helmet } from 'react-helmet'
import Recaptcha from 'react-recaptcha'
import { Card, Link, InputGroup, Page } from 'src/components'
import { TOPICS } from 'src/components/config'
import { useDarkModeContext } from 'src/contexts/DarkModeContext'

import './DatePickerOverrides.module.scss'

import styles from './ConferenceForm.module.scss'
import { Conference } from './types/Conference'
import {
  getConferenceData,
  CONFERENCE_DATE_FORMAT,
} from './utils/getConferenceData'

const SORTED_TOPICS_KEYS = sortBy(Object.keys(TOPICS), (x) =>
  TOPICS[x].toLocaleLowerCase()
)
const LOCATION_ONLINE_REGEX = /online|remote|everywhere|world|web|global|virtual|www|http/i
const VALID_URL_REGEX = /^http(s?):\/\//
const URL_PARAMETER_REGEX = /\?/
const URL_SHORTENER_REGEX = /(\/bitly)|(\/bit\.ly)|(\/t\.co)/i
const TWITTER_REGEX = /@(\w){1,15}$/
const UNWANTED_CONFERENCE_NAME_REGEX = /webinar|marketing|practical guide|meeting|trends|digimarcon|hackathon|101|estate|expo|techspo|outsourcing|physical|biology|neuroscience|healthcare|nutrition|Food Science/i
const UNWANTED_CONFERENCE_URL_REGEX = /webinar|marketing|hackathon|digimarcon/i

const LOCATION_TYPES = [
  {
    value: 'online',
    name: 'Online',
  },
  {
    value: 'in-person',
    name: 'In person',
  },
  {
    value: 'hybrid',
    name: 'In person & online',
  },
]

const defaultConference: Conference = {
  name: '',
  url: '',
  city: '',
  country: '',
  startDate: null,
  endDate: null,
  topic: '',
  cfpUrl: '',
  cfpEndDate: null,
  cocUrl: '',
  online: true,
  offersSignLanguageOrCC: false,
  twitter: '@',
}

const ConferenceForm: React.FC = () => {
  const endDateDatepickerRef = useRef<DatePicker>(null)
  const [locationType, setLocationType] = useState('online')
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false)
  const [captchaResponse, setCaptchaResponse] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(false)
  const [errors, setErrors] = useState({})
  const [conference, setConference] = useState(defaultConference)
  const {
    values: { darkModeEnabled },
  } = useDarkModeContext()

  const handleDateChangeBuilder = (key: string) => {
    return (date: Date) => {
      setConference({
        ...conference,
        [key]: date,
      })
    }
  }

  const handleDateChange = {
    startDate: handleDateChangeBuilder('startDate'),
    endDate: handleDateChangeBuilder('endDate'),
    cfpEndDate: handleDateChangeBuilder('cfpEndDate'),
  }

  const isUrlValid = (url: string) => {
    return (
      VALID_URL_REGEX.test(url) &&
      !URL_PARAMETER_REGEX.test(url) &&
      !URL_SHORTENER_REGEX.test(url) &&
      !UNWANTED_CONFERENCE_URL_REGEX.test(url)
    )
  }

  const validateForm = (conference: Conference) => {
    const {
      startDate,
      endDate,
      city,
      country,
      name,
      url,
      cfpUrl,
      cfpEndDate,
      twitter,
    } = conference

    const isNotOnline = locationType !== 'online'
    const cfp = cfpUrl || cfpEndDate
    const errors = {
      name: startDate
        ? name.indexOf(startDate.getFullYear().toString().substring(2, 4)) !==
          -1
        : false,
      url: !isUrlValid(url),
      endDate: startDate && endDate ? startDate > endDate : false,
      city: isNotOnline && LOCATION_ONLINE_REGEX.test(city),
      country: isNotOnline && LOCATION_ONLINE_REGEX.test(country),
      cfpUrl: cfpUrl.length === 0 ? cfp : !isUrlValid(cfpUrl) || url == cfpUrl,
      cfpEndDate: startDate && cfpEndDate ? cfpEndDate >= startDate : cfp,
      twitter: twitter.length <= 1 ? false : !TWITTER_REGEX.test(twitter),
      unwantedConference:
        name.length > 0 && UNWANTED_CONFERENCE_NAME_REGEX.test(name),
    }

    setErrors(errors)
    return errors
  }

  const handleStartDateSelect = (startDate: Date) => {
    const { endDate } = conference
    endDateDatepickerRef.current?.setFocus()

    setConference({
      ...conference,
      startDate,
      endDate: endDate || startDate,
    })
  }

  const handleFieldChange = (
    event: ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    setConference({
      ...conference,
      [event.target.name]: event.target.value,
    })
  }

  const handleLocationTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLocationType(event.target.value)
    setConference({
      ...conference,
      online: ['online', 'hybrid'].includes(event.target.value),
    })
  }

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    setConference({
      ...conference,
      [event.target.name]: !conference[event.target.name],
    })
  }

  // Executed once the captcha has been verified
  // can be used to post forms, redirect, etc.
  const handleVerifyRecaptcha = (captchaResponse: string) => {
    setCaptchaResponse(captchaResponse)
  }

  const handleFormSubmit = (event: React.FormEvent) => {
    const errors = validateForm(conference)
    event.preventDefault()
    const erroneousFieldId = Object.keys(errors).find((x) => errors[x])
    
    if (erroneousFieldId) {
      const erroneousField = document.getElementById(erroneousFieldId)
      if (erroneousField && erroneousField.focus) {
        erroneousField.focus()
      }
      return
    }

    setSubmitting(true)

    const searchClient = algoliasearch(
      process.env.REACT_APP_ALGOLIA_APPLICATION_ID as string,
      process.env.REACT_APP_ADMIN_API_KEY as string
    )

    const finalData = getConferenceData(conference)

    const index = searchClient.initIndex('prod_conferences')

    index
      .saveObjects(finalData, {
        autoGenerateObjectIDIfNotExist: true,
      })
      .then((res) => {
        console.log(res)
        window.location.href = "/"
      })
      .catch((e) => {
        console.error(e)
        setServerError(true)
      })

    // fetch(`${process.env.REACT_APP_API_END_POINT_DOMAIN}/api/conferences`, {
    //   headers: {
    //     Accept: 'application/json',
    //     'Content-Type': 'application/json',
    //   },
    //   method: 'post',
    //   body: getConferenceData(conference),
    // })
    //   .then((response) => {
    //     if (response.status !== 200) {
    //       throw new Error('Network response was not ok')
    //     }
    //     return response.json()
    //   })
    //   .then((responseJson) => {
    //     const pullRequestUrl = responseJson.data.find(
    //       (element: string[]) => element[0] == 'html_url'
    //     )
    //     if (pullRequestUrl) {
    //       window.location.href = pullRequestUrl[1]
    //     }
    //   })
    //   .catch((e) => {
    //     console.error(e)
    //     setServerError(true)
    //   })
  }

  const hasError = (field: string) => {
    return errors[field]
  }

  const errorFor = (field: string, errorMessage: string) => {
    if (!errors[field]) {
      return null
    }

    return <div className={styles.errorText}>{errorMessage}</div>
  }

  const {
    name,
    url,
    topic,
    city,
    country,
    cfpUrl,
    twitter,
    cocUrl,
    offersSignLanguageOrCC,
    startDate,
    endDate,
    cfpEndDate,
  } = conference

  return (
    <Page
      htmlTitle='Add a new conference to Confs.tech'
      title='Add a new conference'
      searchEngineTitle='Add a conference to Confs.tech and gain visibility'
      backButton
    >
      <Helmet>
        <script src='https://www.google.com/recaptcha/api.js' async defer />
      </Helmet>

      <div>
        <p>
          We is focused on conferences on software development and
          related topics, such as product management, UX, and AI.
        </p>
        <p>
          Know a conference on one of these topics? Feel free to submit it using
          this form!
        </p>
        <p>
          This will create a{' '}
          <Link
            external
            url='#'
          >
            pull request on GitHub
          </Link>{' '}
          where you can also add additional comments and track submission
          status. Our team will review your request as soon as possible!
        </p>
      </div>

      <div>
        <Card>
          <form onSubmit={handleFormSubmit} autoComplete='off'>
            <InputGroup>
              <div>
                <label htmlFor='type'>Topic</label>
                <select
                  id='type'
                  className={classNames(hasError('topic') && styles.error)}
                  name='topic'
                  value={topic}
                  required
                  onChange={handleFieldChange}
                >
                  <option key='placeholder' value=''>
                    Select a topic
                  </option>
                  {SORTED_TOPICS_KEYS.map((value: string) => (
                    <option key={value} value={value}>
                      {TOPICS[value]}
                    </option>
                  ))}
                </select>
              </div>
            </InputGroup>
            <InputGroup>
              <div>
                <label htmlFor='name'>Conference name</label>
                <input
                  className={classNames(hasError('name') && styles.error)}
                  type='text'
                  name='name'
                  required
                  autoComplete='off'
                  placeholder='Conference name (without year)'
                  value={name}
                  id='name'
                  onChange={handleFieldChange}
                />
                {errorFor('name', 'Name should not contain year.')}
              </div>
            </InputGroup>
            <InputGroup>
              <div>
                <label htmlFor='url'>URL</label>
                <input
                  className={classNames(hasError('url') && styles.error)}
                  type='url'
                  placeholder='Eg.: https://confs.tech'
                  required
                  value={url}
                  name='url'
                  id='url'
                  onChange={handleFieldChange}
                />
                <div className={styles.InputHint}>
                  Must be valid, up and running and specific for the conference
                </div>
                {errorFor(
                  'url',
                  'Must be a valid URL. No query parameters or URL shorteners are allowed.'
                )}
              </div>
            </InputGroup>
            <InputGroup inline>
              <div>
                <label htmlFor='startDate'>Start date</label>
                <DatePicker
                  dateFormat={CONFERENCE_DATE_FORMAT}
                  name='startDate'
                  id='startDate'
                  required
                  selected={startDate}
                  onChange={handleStartDateSelect}
                  placeholderText='Eg.: 2021-03-10'
                />
              </div>
              <div>
                <label htmlFor='endDate'>End date</label>
                <DatePicker
                  ref={endDateDatepickerRef}
                  dateFormat={CONFERENCE_DATE_FORMAT}
                  name='endDate'
                  id='endDate'
                  required
                  selected={endDate}
                  onChange={handleDateChange.endDate}
                  placeholderText='Eg.: 2021-03-12'
                />
                {errorFor('endDate', 'End date is before start date.')}
              </div>
            </InputGroup>
            <InputGroup>
              <label htmlFor='locationType'>Location</label>
              <select
                id='locationType'
                name='locationType'
                value={locationType}
                required
                onChange={handleLocationTypeChange}
              >
                {LOCATION_TYPES.map((locationType) => (
                  <option key={locationType.value} value={locationType.value}>
                    {locationType.name}
                  </option>
                ))}
              </select>
            </InputGroup>{' '}
            {locationType !== 'online' && (
              <InputGroup inline>
                <div>
                  <label htmlFor='city'>City</label>
                  <input
                    className={classNames(hasError('city') && styles.error)}
                    required={locationType !== 'online'}
                    type='text'
                    id='city'
                    name='city'
                    value={city}
                    onChange={handleFieldChange}
                  />
                  {errorFor(
                    'city',
                    'For Online conferences please select location "online"'
                  )}
                </div>
                <div>
                  <label htmlFor='country'>Country</label>
                  <input
                    className={classNames(hasError('country') && styles.error)}
                    required={locationType !== 'online'}
                    type='text'
                    id='country'
                    name='country'
                    value={country}
                    onChange={handleFieldChange}
                  />
                  {errorFor(
                    'country',
                    'For Online conferences please select location "online"'
                  )}
                </div>
              </InputGroup>
            )}
            <InputGroup inline>
              <div>
                <label htmlFor='cfpUrl'>CFP URL</label>
                <input
                  className={classNames(hasError('cfpUrl') && styles.error)}
                  type='url'
                  name='cfpUrl'
                  id='cfpUrl'
                  value={cfpUrl}
                  onChange={handleFieldChange}
                />
                {errorFor(
                  'cfpUrl',
                  'CFP URL must different than URL. No URL query parameters or URL shorteners are allowed.'
                )}
              </div>
              <div>
                <label htmlFor='cfpEndDate'>CFP end date</label>
                <DatePicker
                  dateFormat={CONFERENCE_DATE_FORMAT}
                  name='cfpEndDate'
                  id='cfpEndDate'
                  selected={cfpEndDate}
                  onChange={handleDateChange.cfpEndDate}
                />
                {errorFor('cfpEndDate', 'CFP end date is after start date.')}
              </div>
            </InputGroup>
            <InputGroup>
              <label htmlFor='twitter'>Conference @TwitterHandle</label>
              <input
                className={classNames(hasError('twitter') && styles.error)}
                type='text'
                name='twitter'
                id='twitter'
                value={twitter}
                onChange={handleFieldChange}
              />
              {errorFor('twitter', 'Should be formatted like @twitter')}
            </InputGroup>
            <InputGroup>
              <label htmlFor='cocUrl'>Code Of Conduct URL</label>
              <input
                type='text'
                name='cocUrl'
                id='cocUrl'
                value={cocUrl}
                onChange={handleFieldChange}
              />
            </InputGroup>
            <InputGroup inline>
              <input
                type='checkbox'
                name='offersSignLanguageOrCC'
                id='offersSignLanguageOrCC'
                checked={offersSignLanguageOrCC}
                onChange={handleCheckboxChange}
              />
              <label htmlFor='offersSignLanguageOrCC'>
                This conference offers interpretation to International sign
                language or closed captions.
              </label>
            </InputGroup>            
            {serverError && (
              <p className={styles.errorText}>
                An error happened from the server.
                <br />
                If it still happens, you can&nbsp;
                <Link
                  external
                  url='https://github.com/tech-conferences/conference-data/issues/new'
                >
                  create an issue on our GitHub repo.
                </Link>
              </p>
            )}
            {errors['unwantedConference'] && (
              <p className={styles.errorText}>
                A part of the conference name has been blocklisted (Webinar,
                Marketing, Hackathon, Meeting, Digimarcon, Techspo etc.)
                <br />
                Those submissions will not get added to our list &nbsp;
                <Link
                  external
                  url='https://github.com/tech-conferences/conference-data/pulls?q=is%3Aunmerged'
                >
                  (list of closed and not merged entries)
                </Link>
                <br />
                Confs.tech is focused on conferences related to software
                development. We believe that this event is not developer-related
                and therefore, it is out of the confs.tech's scope.
                <br />
                If you think this was an error, and you want to add a software
                developer related conference please &nbsp;
                <Link
                  external
                  url='https://github.com/tech-conferences/conference-data/issues/new'
                >
                  create an issue on our GitHub repo.
                </Link>
              </p>
            )}
            <button
              className={styles.Button}
              disabled={ submitting }
              type='submit'
              value='Submit'
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </Card>
      </div>
    </Page>
  )
}

export default ConferenceForm

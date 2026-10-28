import { labels } from '../shared/labels'
import { Welcome } from '../shared/welcome'
import { mountPage } from './mount-page'

mountPage(`${labels.welcome.title} · ${labels.name}`, <Welcome />)

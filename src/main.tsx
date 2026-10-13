import React from 'react';
import {createRoot} from 'react-dom/client';
import Tracker from './app/tracker';
import './app/globals.css';
createRoot(document.getElementById('root')!).render(<Tracker apiUrl="https://tiktokcorewithrileigh.rydog3707.chatgpt.site/api/tracker" mentorUrl="https://tiktokcorewithrileigh.rydog3707.chatgpt.site/signin-with-chatgpt?return_to=%2F"/>);

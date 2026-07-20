use crate::{
    error::HostError,
    state::{AppService, OpenedProjectDto, SessionHandle, opened_project_dto},
};
use project_io::ProjectSession;
use std::{
    collections::HashMap,
    sync::{Arc, MutexGuard},
};
use uuid::Uuid;

impl AppService {
    pub(crate) fn registry_len(&self) -> Result<usize, HostError> {
        Ok(self.lock_registry()?.len())
    }

    pub(crate) fn lookup_session(&self, session_id: Uuid) -> Result<SessionHandle, HostError> {
        self.lock_registry()?
            .get(&session_id)
            .cloned()
            .ok_or(HostError::SessionNotFound)
    }

    pub(crate) fn track_session(
        &self,
        mut session: ProjectSession,
    ) -> Result<OpenedProjectDto, HostError> {
        let mut opened = match opened_project_dto(Uuid::nil(), &session) {
            Ok(opened) => opened,
            Err(error) => {
                let _ = session.close();
                return Err(error);
            }
        };
        let mut sessions = match self.lock_registry() {
            Ok(sessions) => sessions,
            Err(error) => {
                let _ = session.close();
                return Err(error);
            }
        };
        let session_id = {
            loop {
                let candidate = Uuid::new_v4();
                if !sessions.contains_key(&candidate) {
                    break candidate;
                }
            }
        };
        sessions.insert(session_id, Arc::new(std::sync::Mutex::new(session)));
        drop(sessions);
        opened.session_id = session_id.to_string();
        Ok(opened)
    }

    pub(crate) fn remove_if_same(
        &self,
        session_id: Uuid,
        expected: &SessionHandle,
    ) -> Result<bool, HostError> {
        let mut sessions = self.lock_registry()?;
        let matches = sessions
            .get(&session_id)
            .is_some_and(|actual| Arc::ptr_eq(actual, expected));
        if matches {
            sessions.remove(&session_id);
        }
        Ok(matches)
    }

    fn lock_registry(&self) -> Result<MutexGuard<'_, HashMap<Uuid, SessionHandle>>, HostError> {
        self.sessions
            .lock()
            .map_err(|_| HostError::HostStateUnavailable)
    }
}

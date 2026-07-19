//! AetherTwin's least-privilege desktop host boundary.

pub mod commands;
mod state;

pub use state::{
    AppService, CreateProjectDto, NativeErrorDto, OpenProjectDto, OpenedProjectDto,
    RecoverProjectDto,
};

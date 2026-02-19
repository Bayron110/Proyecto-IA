import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Fotter } from './fotter';

describe('Fotter', () => {
  let component: Fotter;
  let fixture: ComponentFixture<Fotter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Fotter]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Fotter);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
